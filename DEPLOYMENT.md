# Jata Cafe — Deployment Guide

Everything needed to take `jata-cafe` from a local checkout to a live site on your own domain.

> **⚠️ This document is out of date and is being rewritten.**
>
> It describes the original architecture: SQLite on a local disk, served by a long-running Node
> process on a VPS. On that basis §1 states the app cannot be deployed to Vercel, which was true
> at the time.
>
> The app is being migrated to **Supabase Postgres + Supabase Storage**, which removes the
> local-disk dependency and makes **Vercel** a valid target. Until that migration lands on `main`,
> the instructions below still match the code — `better-sqlite3` is still the database driver, so
> a Vercel deployment would currently fail. Do not follow the VPS instructions if you intend to
> deploy to Vercel; wait for the rewrite.
>
> Tracking: branch `feat/supabase-migration`.

Written against the repository as it stands: Next.js `16.4.0` (App Router), React `19.3`, TypeScript, Tailwind CSS v4, `better-sqlite3` `13.0.3`, `sharp` `0.35.5`.

---

## 1. Overview

Jata Cafe is a mobile-first ordering site for a cafe in Eastleigh, Nairobi. The storefront lists the menu with prices in KES, applies happy-hour and promo-code discounts, and hands the finished basket to WhatsApp for checkout. Behind it sits an owner dashboard at **`/ms`** for the menu, banners, delivery zones, promotions, orders, customers and site settings.

Architecture, briefly:

- **One long-running Node process.** `next start` serves server-rendered pages, server actions and two API routes (`/api/checkout`, `/api/promo`).
- **SQLite on local disk.** A single file, accessed through `better-sqlite3` synchronously in-process. There is no separate database server, no connection string, no network hop.
- **Images on local disk.** Placeholder artwork is generated into `public/img/generated/` at build time; owner-uploaded photos land in `public/uploads/`.
- **Writes happen at request time.** Orders, customers, sessions, login attempts and settings are all written by the running app.

### Read this before you choose a host

> **This app cannot run on a serverless platform as-is. That includes Vercel.**
>
> The database is a file the app writes to while handling requests. Serverless functions get an ephemeral filesystem and no shared state between invocations, so each cold start would either see an empty database or a different copy of one. Uploaded images would disappear the same way. You would get a site that looks fine for five minutes and silently loses every order.
>
> What you need instead: **a host that gives you a persistent Node process and a writable disk that survives deploys.** A small VPS (DigitalOcean, Hetzner, Linode, Vultr, Contabo) is the simplest answer. Fly.io, Railway and Render work too, as long as you attach a volume. Containers work, as long as you mount volumes.

Moving to Postgres or Turso would remove this constraint, but that is a code change, not a deployment choice, and it is out of scope here.

---

## 2. Prerequisites

**Node.js 22 LTS or newer.** `package.json` declares `"engines": { "node": ">=20.9.0" }`, but the installed `better-sqlite3@13.0.3` declares `"engines": { "node": ">=22" }`. The stricter one wins in practice: on Node 20 you will get `EBADENGINE` warnings from npm and an unsupported native module. **Use Node 22 or 24.** (See the appendix for a note on the `engines` field.)

You also need:

- **npm 10+** (ships with Node 22/24). The repo has a `package-lock.json`, so use `npm ci` on servers.
- **git** — strongly recommended, see §4.
- **A Linux server with a persistent disk**, 1 GB RAM minimum, 2 GB comfortable. The `next build` step is the memory-hungry part; if you have 1 GB, add swap.
- **A domain name** with an A record pointing at the server, plus **HTTPS**. Not optional — see the gotcha in §5.7.
- **Build tooling for native modules**, in case a prebuilt binary is unavailable for your platform: `python3`, `make`, `g++` (Debian/Ubuntu: `build-essential`).
- **The `sqlite3` CLI** on the server, for backups and inspection.

### What "native module" means for you

Two dependencies ship compiled C/C++ code:

- **`better-sqlite3`** bundles Node-API prebuilt binaries for every common platform inside the package itself (`node_modules/better-sqlite3/prebuilds/` contains `linux-x64`, `linux-arm64`, `linuxmusl-x64`, `linuxmusl-arm64`, `darwin-*`, `win32-*`). Because they are Node-API binaries, they are ABI-stable across Node major versions, so a Node upgrade is unlikely to break it. If no matching prebuild exists for your platform, npm falls back to compiling from source, which is when you need `python3`/`make`/`g++`.
- **`sharp`** resolves platform-specific binaries as *optional dependencies* (`@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64`, and so on). npm only installs the ones matching the machine doing the install.

The consequence, and it catches people every time: **install dependencies on the target platform.** Developing on Windows and copying `node_modules` to a Linux server will not work, because the `sharp` binaries in your local tree are Windows binaries. Ship source, run `npm ci` on the server. Keep the build Node version and the runtime Node version identical — the same container image, or the same `nvm` version on the box.

---

## 3. Environment variables

`.env.example` is the authoritative list. Copy it to `.env.local` for development, or to a file read by your process manager in production.

| Variable | Required | What it controls | Production example |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical base URL for page metadata, Open Graph/JSON-LD, `robots.txt` and `sitemap.xml`. Read in `src/app/layout.tsx`, `src/app/(site)/layout.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`. Falls back to `https://jatacafe.co.ke` when unset. | `https://jatacafe.co.ke` |
| `DATABASE_PATH` | Yes in production | Location of the SQLite file. Resolved in `src/lib/db.ts` with `path.resolve(process.cwd(), DATABASE_PATH)` — a relative value is relative to the **process working directory**, an absolute value is used as-is. Defaults to `<cwd>/data/jata.sqlite`. | `/srv/jata/data/jata.sqlite` |
| `SESSION_SECRET` | Optional today | Declared for signing admin session cookies. **No code reads it yet** — see the note below. | a 96-char hex string |
| `SEED_ADMIN_EMAIL` | Recommended | Email of the owner account created the first time the database is initialised. Lowercased before insert. Defaults to `admin@jatacafe.co.ke`. | `owner@jatacafe.co.ke` |
| `SEED_ADMIN_PASSWORD` | **Set this** | Password for that first account. Defaults to `ChangeMe@Jata2026`, which is public knowledge because it is in the repo. | a strong one-time password |
| `SEED_ADMIN_NAME` | Optional | Display name for the first account. Defaults to `Jata Cafe Manager`. | `Jata Cafe Manager` |
| `GOOGLE_SITE_VERIFICATION` | Optional | Google Search Console verification token. Emitted as a `<meta>` tag by `src/app/layout.tsx` only when set; leave empty to omit it. | `abc123…` from Search Console |

Set by the runtime rather than by `.env.example`:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Must be `production` in production. It is what flips the session cookie to `secure: true` in `src/lib/auth.ts`. |
| `PORT` | Port for `next start`. Defaults to `3000`. |

### About `SESSION_SECRET`

Being straight with you: `SESSION_SECRET` appears in `.env.example` but nothing in `src/` reads it. Sessions do not need it. `createSession()` generates a 32-byte random token with `crypto.randomBytes`, stores only its SHA-256 hash in the `sessions` table, and puts the raw token in an `httpOnly` cookie. There is no signed payload to verify, so there is no secret to verify it with. That is a sound design — a stolen database gives an attacker hashes, not usable tokens.

So it is reserved for future use, not load-bearing today. Leave it in place and set a real value anyway: it costs nothing, and the day someone adds signed state the variable is already provisioned.

```bash
# Linux / macOS
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```powershell
# Windows PowerShell — same thing, same output format
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### The build-time trap

Variables prefixed `NEXT_PUBLIC_` are **inlined into the compiled output at build time**, not read from the environment when the server starts. `NEXT_PUBLIC_SITE_URL` is used in bundled server code (`robots.ts`, `sitemap.ts`, both layouts), so whatever value is present during `npm run build` is baked in. Setting it later in a systemd unit changes nothing until you rebuild. See the [Next.js environment variables guide](https://nextjs.org/docs/app/guides/environment-variables). *(Content was rephrased for compliance with licensing restrictions.)*

Everything else in the table is read at runtime and can change with a restart.

Next also loads `.env.local` from the working directory when you run `next start`, so an `.env.local` on the server works for the runtime variables. Explicit process-manager environment is clearer about what is actually in effect, and that is what §5 uses.

---

## 4. Local setup

Paths in this section are Windows-style, because that is the development machine this project was built on. Everything from §5 onward is Linux.

### 4.1 Put it in git first

This project is **not currently a git repository** — there is no `.git` directory. Deployment gets much easier if you fix that before anything else, and the `.gitignore` is already written for it (it excludes `node_modules/`, `.next/`, `data/`, `public/uploads/*`, `public/img/generated/` and every `.env*.local`).

```powershell
cd c:\Users\Eliza\Desktop\Jata
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
# then add a private remote
git remote add origin git@github.com:your-org/jata-cafe.git
git push -u origin main
```

Use a **private** repository. Even with secrets ignored, the seeded default password and the whole dashboard surface are in here.

If you genuinely cannot use git, §5.3 has an rsync/scp path.

### 4.2 Install and configure

```powershell
cd c:\Users\Eliza\Desktop\Jata
npm install
Copy-Item .env.example .env.local
```

Edit `.env.local`. For local work the defaults are mostly fine; set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so metadata is not pointing at production, and pick your own `SEED_ADMIN_PASSWORD` before the first run.

### 4.3 First run

```powershell
npm run dev
```

Two things happen on the way up:

1. **`predev`** runs `node scripts/generate-placeholders.mjs`. It renders hand-written SVG into optimised WebP via `sharp`, writing hero banners, per-category artwork, a share card and PWA icons into `public/img/generated/` and `public/`, and it creates `public/uploads/` if missing. Existing files are skipped, so it is cheap on repeat runs — use `node scripts/generate-placeholders.mjs --force` to regenerate. The same script runs as `prebuild` before every `npm run build`.
2. **The database bootstraps itself** the first time any page touches `db()` in `src/lib/db.ts`. That function creates the parent directory, opens the file, sets `journal_mode = WAL`, `foreign_keys = ON` and `busy_timeout = 5000`, runs the `CREATE TABLE IF NOT EXISTS` schema, then seeds. There are no migration commands to run, ever — the bootstrap is idempotent and runs on every boot.

Seeding is conditional. If `categories` is empty it inserts the default settings, six menu categories with ~50 items, three hero banners, eight delivery zones and three promotions. Separately, if `admin_users` is empty it creates the owner account from the `SEED_ADMIN_*` variables and prints the credentials to the console.

Visit <http://localhost:3000> for the storefront, then **<http://localhost:3000/ms/login>** for the dashboard. Sign in with the seeded email and password. The account is created with `must_change_password = 1`, so you are sent straight to a change-password screen. The new password must be at least 10 characters with an uppercase letter, a lowercase letter and a digit (`passwordProblem()` in `src/lib/auth.ts`). Changing it clears every existing session, so you log in again with the new password.

The dashboard is deliberately not linked from the storefront. Bookmark `/ms`.

### 4.4 Other scripts

```powershell
npm run typecheck   # tsc --noEmit
npm run assets      # regenerate placeholder artwork
```

**`npm run db:reset` does not work.** The script is declared in `package.json` as `node scripts/reset-db.mjs`, but `scripts/reset-db.mjs` is not in the repository — `scripts/` contains only `generate-placeholders.mjs`. Running it fails with `Cannot find module`. To start from a clean database, stop the app and delete the three files by hand:

```powershell
# local only - this destroys all orders, customers and settings
Remove-Item data\jata.sqlite, data\jata.sqlite-wal, data\jata.sqlite-shm -ErrorAction SilentlyContinue
```

The next page load recreates and reseeds everything.

---

## 5. Primary path: VPS with systemd and a reverse proxy

One Ubuntu 24.04 server, Node 22, the app on `127.0.0.1:3000` under systemd, nginx terminating TLS in front. This is the path to use unless you have a reason not to.

Layout we will build:

```
/srv/jata/
├── app/                       # the checkout: code, node_modules, .next
│   └── public/uploads  ->     # bind-mounted from ../uploads
├── data/jata.sqlite           # DATABASE_PATH
├── uploads/                   # owner-uploaded images (persistent)
└── backups/
```

Both `data/` and `uploads/` must live on the persistent disk. If your server has a single disk, `/srv` already is that disk and you are done thinking about it. If you attached separate block storage, mount it at `/srv/jata` and keep the same tree.

### 5.1 Server preparation

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx sqlite3 build-essential python3 ufw

# Node 22 LTS from NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # expect v22.x
npm -v
```

### 5.2 A non-root service user

```bash
sudo useradd --system --create-home --home-dir /srv/jata --shell /usr/sbin/nologin jata
sudo mkdir -p /srv/jata/{app,data,uploads,backups}
sudo chown -R jata:jata /srv/jata
sudo chmod 750 /srv/jata
```

The app never needs root. It binds a high port and writes only inside `/srv/jata`.

### 5.3 Get the code onto the box

**With git (preferred):**

```bash
sudo -u jata git clone https://github.com/your-org/jata-cafe.git /srv/jata/app
```

For a private repo over SSH, create a deploy key as the `jata` user (`sudo -u jata ssh-keygen -t ed25519`) and add the public key to the repository as a read-only deploy key.

**Without git**, push an archive from the Windows machine. Exclude everything platform-specific — this is the step where copying `node_modules` would break `sharp`:

```powershell
# on the dev machine
tar -czf jata.tar.gz --exclude=node_modules --exclude=.next --exclude=data --exclude=.env.local .
scp jata.tar.gz you@your-server:/tmp/
```

```bash
# on the server
sudo -u jata tar -xzf /tmp/jata.tar.gz -C /srv/jata/app
rm /tmp/jata.tar.gz
```

`rsync -av --exclude node_modules --exclude .next --exclude data ./ you@server:/srv/jata/app/` does the same job and is better for repeat deploys.

### 5.4 Environment file

```bash
sudo -u jata tee /srv/jata/app/.env.production >/dev/null <<'EOF'
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://jatacafe.co.ke
DATABASE_PATH=/srv/jata/data/jata.sqlite
SESSION_SECRET=paste-your-96-char-hex-here
SEED_ADMIN_EMAIL=owner@jatacafe.co.ke
SEED_ADMIN_PASSWORD="pick-a-strong-one-time-password"
SEED_ADMIN_NAME="Jata Cafe Manager"
GOOGLE_SITE_VERIFICATION=
EOF

sudo chmod 600 /srv/jata/app/.env.production
sudo chown jata:jata /srv/jata/app/.env.production
```

Set `SEED_ADMIN_PASSWORD` **now**, before the database is ever created. After the first page load the account exists and this variable is ignored forever.

This file is read by systemd via `EnvironmentFile=`. Write plain `KEY=value` lines with no `export`, and **wrap any value containing spaces or special characters in double quotes** — systemd's parser understands them and strips them ([reference](https://stackoverflow.com/a/37865527)). That is why `SEED_ADMIN_NAME` is quoted above. Unquoted spaces would truncate the value at the first space.

### 5.5 Uploads on the persistent disk

Uploaded images are served out of `public/uploads`, which lives inside the checkout. That is a problem the moment you deploy by replacing the checkout. Point it at the persistent directory instead:

```bash
# On a fresh checkout this directory is empty. rmdir refuses to delete it if it
# is not - which is the safety you want, because anything in there is an image
# that exists nowhere else. If it fails, move the contents to /srv/jata/uploads
# first, then retry.
sudo rmdir /srv/jata/app/public/uploads 2>/dev/null || true

sudo -u jata mkdir -p /srv/jata/app/public/uploads /srv/jata/uploads
sudo mount --bind /srv/jata/uploads /srv/jata/app/public/uploads

# make it survive reboots
echo '/srv/jata/uploads /srv/jata/app/public/uploads none bind 0 0' | sudo tee -a /etc/fstab

# confirm
findmnt /srv/jata/app/public/uploads
```

A symlink (`ln -s /srv/jata/uploads /srv/jata/app/public/uploads`) also works and needs no fstab entry. The bind mount is sturdier because nothing can accidentally replace it with a real directory.

### 5.6 Install and build

```bash
cd /srv/jata/app
sudo -u jata npm ci

# Only the build-time variables need to be present here. Pass them explicitly
# rather than sourcing .env.production, which is written for systemd, not bash.
sudo -u jata env NODE_ENV=production \
                 NEXT_PUBLIC_SITE_URL=https://jatacafe.co.ke \
                 npm run build
```

`npm run build` triggers `prebuild` first, so the artwork is generated before Next compiles. Passing `NEXT_PUBLIC_SITE_URL` matters here because of the build-time inlining described in §3 — build with the wrong value and your canonical URLs and sitemap stay wrong until you rebuild. Add `GOOGLE_SITE_VERIFICATION=…` to the same line if you use it, for the same reason. The runtime-only variables (`DATABASE_PATH`, `SEED_ADMIN_*`) are supplied by systemd in §5.7 and are not needed now.

Expect the build to take a minute or two and to be the peak memory moment. If it is killed by the OOM reaper on a 1 GB box, add swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 5.7 systemd unit

Create `/etc/systemd/system/jata.service`:

```ini
[Unit]
Description=Jata Cafe storefront and dashboard
Documentation=https://jatacafe.co.ke
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=jata
Group=jata
WorkingDirectory=/srv/jata/app
EnvironmentFile=/srv/jata/app/.env.production
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /srv/jata/app/node_modules/next/dist/bin/next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5
TimeoutStopSec=20
KillSignal=SIGTERM

# logs go to journald
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jata

# modest hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/srv/jata

[Install]
WantedBy=multi-user.target
```

Notes on the choices:

- `WorkingDirectory` is load-bearing. `DATABASE_PATH` is resolved against the process cwd when it is relative, and `scripts/generate-placeholders.mjs` uses `process.cwd()` too. The absolute `DATABASE_PATH` above makes this robust either way; keep both correct.
- `-H 127.0.0.1` matters. `next start` binds `0.0.0.0` by default, which would expose port 3000 directly to the internet alongside nginx.
- Calling the `next` binary through `node` rather than `npm run start` means systemd supervises the actual server process, so `SIGTERM` reaches it and restarts are clean.
- `ReadWritePaths=/srv/jata` is required because `ProtectSystem=full` makes most of the filesystem read-only. The app writes the database, the WAL sidecars, uploads, and the Next image-optimiser cache under `.next/cache`.

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jata
sudo systemctl status jata
journalctl -u jata -f          # live logs
curl -I http://127.0.0.1:3000  # expect HTTP/1.1 200
```

That first request is what creates and seeds the database. Watch the log for the seeded credentials block.

### 5.8 nginx and TLS

> **Gotcha, and it is the expensive one.** `src/lib/auth.ts` sets the `jata_session` cookie with `secure: process.env.NODE_ENV === "production"`. Over plain HTTP in production the browser silently refuses to store it. The login POST succeeds, the redirect fires, the dashboard finds no cookie and bounces you back to the login form — **with no error message**. If login loops, you are missing HTTPS. Do not debug anything else first.

Add the websocket upgrade map once, in `/etc/nginx/conf.d/upgrade.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Then `/etc/nginx/sites-available/jata`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name jatacafe.co.ke www.jatacafe.co.ke;

    # certbot writes its challenge files here
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name jatacafe.co.ke www.jatacafe.co.ke;

    ssl_certificate     /etc/letsencrypt/live/jatacafe.co.ke/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jatacafe.co.ke/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Phone photos are big. nginx defaults to 1m, which rejects most of them.
    client_max_body_size 15m;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # websocket-safe
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # the real host and scheme, so redirects and absolute URLs are right
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        proxy_read_timeout 60s;
        proxy_redirect off;
    }
}
```

Forwarding `Host` and `X-Forwarded-Proto` is not cosmetic: without them the app sees `localhost` and `http`, and server-side redirects can bounce users off HTTPS — which puts you back in the dropped-cookie failure above.

Enable and issue the certificate:

```bash
sudo ln -s /etc/nginx/sites-available/jata /etc/nginx/sites-enabled/jata
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d jatacafe.co.ke -d www.jatacafe.co.ke
sudo systemctl status certbot.timer   # auto-renewal
```

Run certbot before pasting the `ssl_certificate` paths if the files do not exist yet — nginx refuses to reload while pointing at missing certificates. Easiest order: start with the port 80 server block only, run certbot, let it write the TLS block, then merge in `client_max_body_size` and the proxy headers.

### 5.9 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Port 3000 is bound to loopback and must never be opened.

### 5.10 Caddy instead, if you prefer

Caddy gets you automatic TLS and sane forwarded headers in five lines. `/etc/caddy/Caddyfile`:

```
jatacafe.co.ke, www.jatacafe.co.ke {
    encode zstd gzip

    request_body {
        max_size 15MB
    }

    reverse_proxy 127.0.0.1:3000
}
```

`reverse_proxy` sets `X-Forwarded-Proto`, `X-Forwarded-Host` and `X-Forwarded-For` for you and handles upgrades. `sudo systemctl reload caddy` to apply.

### 5.11 pm2 instead of systemd

Only if you already use pm2 — systemd is one less moving part.

```bash
sudo npm install -g pm2
cd /srv/jata/app
pm2 start node_modules/next/dist/bin/next --name jata -- start -p 3000 -H 127.0.0.1
pm2 save
pm2 startup systemd -u jata --hp /srv/jata   # prints a command to run as root
pm2 logs jata
```

pm2 does not read `EnvironmentFile`, so either export the variables before `pm2 start` or keep a `.env.local` in `/srv/jata/app` for the runtime values.

### 5.12 Smoke test

```bash
curl -I https://jatacafe.co.ke/
curl -s https://jatacafe.co.ke/robots.txt
curl -s https://jatacafe.co.ke/sitemap.xml | head -20
curl -I https://jatacafe.co.ke/ms/login
```

Check that `robots.txt` and `sitemap.xml` contain your real domain, not the fallback. If they do not, `NEXT_PUBLIC_SITE_URL` was missing at build time — rebuild (§11).

---

## 6. Alternative: a platform with volumes

Railway, Fly.io and Render all work, provided you attach a volume and point both `DATABASE_PATH` and `public/uploads` into it. Keep **one instance**: a volume attaches to a single machine, and two app instances cannot share a SQLite file. Disable autoscaling.

### Fly.io

Fly deploys the Docker image from §7. `fly.toml`:

```toml
app = "jata-cafe"
primary_region = "jnb"

[build]
  # NEXT_PUBLIC_* is inlined at build time, so it goes here, not in [env].
  [build.args]
    NEXT_PUBLIC_SITE_URL = "https://jatacafe.co.ke"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  DATABASE_PATH = "/data/jata.sqlite"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[mounts]]
  source = "jata_data"
  destination = "/data"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

```bash
fly launch --no-deploy
fly volumes create jata_data --size 3 --region jnb
fly secrets set SEED_ADMIN_PASSWORD='pick-a-strong-one-time-password' \
                SEED_ADMIN_EMAIL='owner@jatacafe.co.ke' \
                SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
fly deploy
fly scale count 1
fly logs
```

A single volume mounts at one path, so put both kinds of state inside it: the database at `/data/jata.sqlite`, and uploads at `/data/uploads` symlinked into the image. The container entrypoint in §7 does exactly that.

On `release_command`: Fly runs it in a temporary machine that has network, environment and secrets but **not your volume** ([Fly community](https://community.fly.io/t/volume-not-available-in-release-command/6566/2)) — so never use it for database work here. This app needs no release command at all; the schema bootstraps on first request. If you want one for a health check, keep it filesystem-free:

```toml
[deploy]
  release_command = "node -e \"console.log('release ok')\""
```

*(Content was rephrased for compliance with licensing restrictions.)*

### Railway and Render

Same shape, different buttons:

- Attach a volume and note its mount path (`/data` is conventional).
- Set `DATABASE_PATH=/data/jata.sqlite`.
- Make `public/uploads` resolve into the volume — the symlink entrypoint from §7, or a second mount if the platform allows it.
- Build command `npm ci && npm run build`, start command `npm run start`. Set `NEXT_PUBLIC_SITE_URL` as a **build-time** variable.
- Pin Node 22+ (`.nvmrc`, or the platform's Node version setting).
- Keep replicas at 1.

Render's free tier has an ephemeral disk and no volume — it will lose your data. Use a paid instance with a disk attached.

---

## 7. Alternative: Docker

### `output: 'standalone'` is not set

Checked, and worth being precise about: `next.config.ts` sets `serverExternalPackages: ["better-sqlite3", "sharp"]`, image settings, `poweredByHeader: false`, `compress: true`, an empty `experimental.optimizePackageImports`, and a `headers()` function. **It does not set `output: 'standalone'`.**

So the usual copy-the-standalone-folder Dockerfile does not apply. The Dockerfile below is written for a regular build: copy `.next`, `public` and a production-only `node_modules`, then run `next start`.

If you want standalone later, the tradeoff: a much smaller image (Next traces only the files the server actually needs), at the cost of file tracing having to find the native binaries. `better-sqlite3`'s `prebuilds/*.node` and `sharp`'s `@img/*` packages are exactly the kind of thing tracing misses, and you may need `outputFileTracingIncludes` to pull them in. The non-standalone image is bigger and boring, which on a cafe website is the right trade. Nothing here is edited for you — see the appendix.

### Create `.dockerignore`

This file is **not in the repository** and you must add it. Without it, `COPY . .` would copy your Windows `node_modules` into a Linux image and `sharp` would fail at runtime with a missing-binary error.

```gitignore
node_modules
.next
data
public/uploads
public/img/generated
.env
.env.local
.env*.local
.env.production
.git
*.log
DEPLOYMENT.md
```

`.env.production` is on that list deliberately. `COPY . .` would otherwise bake your secrets into an image layer, where they survive in the image history even if you delete the file later.

### Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

############################################
# 1. Dependencies (including dev, for the build)
############################################
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Only needed if a native prebuild is unavailable and npm compiles from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

############################################
# 2. Build
############################################
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=production

# NEXT_PUBLIC_* values are inlined into the output here. Pass the real domain.
ARG NEXT_PUBLIC_SITE_URL=https://jatacafe.co.ke
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `prebuild` runs scripts/generate-placeholders.mjs, then next build compiles.
RUN npm run build

############################################
# 3. Runtime
############################################
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/jata.sqlite

RUN apt-get update && apt-get install -y --no-install-recommends \
        sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Production deps only, installed inside the image so the native binaries
# match this platform and this Node major version.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# next start reads next.config.ts at runtime (Next transpiles it itself, so the
# typescript package is not needed); tsconfig.json is read for compilerOptions.
COPY --from=build --chown=node:node /app/.next        ./.next
COPY --from=build --chown=node:node /app/public       ./public
COPY --from=build /app/next.config.ts /app/tsconfig.json ./

# The Next image optimiser writes into .next/cache at runtime.
RUN mkdir -p .next/cache && chown -R node:node .next \
    && mkdir -p /data && chown node:node /data

COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
```

`-H 0.0.0.0` is correct **inside** a container — the port is only reachable where you publish it, and the compose file below publishes it on loopback only.

Base image choice: Debian slim (glibc). Alpine would also work, since `better-sqlite3` ships `linuxmusl-*` prebuilds and `sharp` has `@img/sharp-linuxmusl-*`, but glibc is the better-tested path and the size difference is not worth the risk here.

### `docker-entrypoint.sh`

Also a file you create. It redirects `public/uploads` into the volume, so uploaded images survive image rebuilds:

```bash
#!/bin/sh
set -e

# better-sqlite3 creates the file but the directory must be reachable.
mkdir -p "$(dirname "${DATABASE_PATH:-/data/jata.sqlite}")"

# Uploads must not live in the image layer. If something is already mounted at
# public/uploads (as in the compose file below), leave it alone. Otherwise point
# it at the volume. rmdir only succeeds on an empty directory, which is the
# safety you want: it will never delete images.
if [ ! -L /app/public/uploads ] && ! mountpoint -q /app/public/uploads; then
    mkdir -p /data/uploads
    if rmdir /app/public/uploads 2>/dev/null; then
        ln -s /data/uploads /app/public/uploads
    else
        echo "[jata] public/uploads is neither empty nor mounted - left untouched" >&2
    fi
fi

exec "$@"
```

Needed on single-volume platforms like Fly.io. Harmless when you mount a directory straight onto `/app/public/uploads`, which is what the compose file below does.

### `docker-compose.yml`

```yaml
services:
  web:
    build:
      context: .
      args:
        NEXT_PUBLIC_SITE_URL: https://jatacafe.co.ke
    image: jata-cafe:latest
    container_name: jata-cafe
    restart: unless-stopped
    user: "1000:1000"
    # Published on loopback only; a reverse proxy on the host terminates TLS.
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NODE_ENV: production
      PORT: "3000"
      DATABASE_PATH: /data/jata.sqlite
      NEXT_PUBLIC_SITE_URL: https://jatacafe.co.ke
    env_file:
      - .env.production
    volumes:
      - /srv/jata/data:/data
      - /srv/jata/uploads:/app/public/uploads
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
```

Create `.env.production` next to the compose file for the secrets you do not want inline — `SESSION_SECRET`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `GOOGLE_SITE_VERIFICATION` — using the same `KEY=value` format as §5.4. Compose reads `env_file` at container start, and values under `environment:` win over it. Then:

```bash
sudo mkdir -p /srv/jata/data /srv/jata/uploads
sudo chown -R 1000:1000 /srv/jata/data /srv/jata/uploads   # must match `user:`

docker compose build
docker compose up -d
docker compose logs -f
```

The `chown` is not optional. Host volume directories owned by root while the container runs as uid 1000 is the single most common cause of `SQLITE_READONLY` and `unable to open database file`.

Put nginx or Caddy from §5.8 in front of the published port exactly as for the bare-metal path.

---

## 8. First run and admin access

What happens the first time the app serves a request:

1. `db()` resolves `DATABASE_PATH`, creates the parent directory if needed, and opens the file — creating it if absent.
2. WAL mode, foreign keys and a 5-second busy timeout are set, then the schema is created (`CREATE TABLE IF NOT EXISTS` throughout, so this is safe on every boot).
3. If `categories` is empty, the full storefront seed runs in a transaction: settings, categories, menu items, banners, delivery zones, promotions.
4. If `admin_users` is empty, the owner account is created from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME`, falling back to `admin@jatacafe.co.ke` / `ChangeMe@Jata2026` / `Jata Cafe Manager`. The password is hashed with scrypt and `must_change_password` is set to `1`.

Then:

1. Open **`https://jatacafe.co.ke/ms/login`**.
2. Sign in with the seeded email and password.
3. You are forced to change the password immediately. The new one needs 10+ characters including upper case, lower case and a digit. Every session is invalidated, so sign in again.

**Set `SEED_ADMIN_PASSWORD` in the environment before the database is ever created.** The fallback password is published in this repository. If the database already exists, changing the variable does nothing — the seed is skipped once `admin_users` has a row. In that case log in and change the password through the dashboard.

Credentials are printed to stdout when the account is created, which means they land in your journal or container logs:

```bash
journalctl -u jata | grep -A4 "Admin account created"
```

Useful on day one, a liability after that. See §9.

---

## 9. Security checklist

- [ ] **Change the seeded password immediately.** Better: never use the fallback — set `SEED_ADMIN_PASSWORD` before first boot.
- [ ] **HTTPS everywhere.** The session cookie is `secure` in production; without TLS nobody can log in. Redirect port 80 to 443.
- [ ] **Keep `/ms` unlinked and unindexed.** It is not in the storefront navigation. Before launch, verify three things: no storefront page links to it (there was a staff-login link in `src/components/site-footer.tsx` while this guide was written), `src/app/robots.ts` disallows `/ms` and `/ms/`, and the `headers()` entry in `next.config.ts` that sets `X-Robots-Tag: noindex, nofollow` plus `Cache-Control: no-store` uses `source: "/ms/:path*"`. Both of those files still referenced the pre-rename dashboard prefix when this was written, and a stale prefix means the dashboard ships without those headers. See the appendix.
- [ ] **Lock down the database file.**

  ```bash
  sudo chown jata:jata /srv/jata/data/jata.sqlite*
  sudo chmod 600 /srv/jata/data/jata.sqlite*
  sudo chmod 750 /srv/jata/data
  ```

- [ ] **Firewall to 22/80/443 only**, with the Node process bound to `127.0.0.1` (§5.7, §5.9). Verify with `sudo ss -tlnp | grep 3000` — it must show `127.0.0.1:3000`, not `0.0.0.0:3000`.
- [ ] **Keep secrets out of version control.** `.gitignore` already covers `.env`, `.env.local`, `.env*.local` and `ADMIN-CREDENTIALS.txt`. Note it does **not** cover `.env.production`, the filename used in §5.4 — either keep that file only on the server (recommended) or add it to `.gitignore` yourself.
- [ ] **Scrub the seeded password from logs** once you have changed it. With journald, `sudo journalctl --vacuum-time=1d` clears history; with Docker, `docker compose logs` is backed by files under `/var/lib/docker/containers/` that `docker compose down && docker compose up -d` resets.
- [ ] **Rate limiting is already handled.** `src/lib/auth.ts` allows 8 failed attempts per email per 15 minutes, tracked in the `login_attempts` table, and clears the counter on success. You do not need fail2ban for the login form, though it is still worth having for SSH.
- [ ] **Sessions expire after 7 days**, are stored as SHA-256 hashes, and expired rows are pruned on every new login. Nothing to configure.
- [ ] **Keep the system patched.** `sudo unattended-upgrades` or a monthly `apt upgrade` plus `sudo systemctl restart jata`.

---

## 10. Backups

### What to back up

1. **The database** — `/srv/jata/data/jata.sqlite`. Orders, customers, menu, settings, promotions.
2. **The uploads** — `/srv/jata/uploads/`. Owner-uploaded photography, which exists nowhere else.

The code is in git. The generated placeholder artwork is reproducible with `npm run assets`. Neither needs backing up.

### Never plain-copy a live SQLite file

The database runs in WAL mode, which means it is really three files: `jata.sqlite`, `jata.sqlite-wal` and `jata.sqlite-shm`. Right now in this repository, `data/jata.sqlite` is 4 KB while `data/jata.sqlite-wal` is over 300 KB — **almost all the data is in the WAL**. A `cp` of the main file alone would hand you a near-empty database, and a `cp` of all three while a write is in flight can capture a torn state.

Use SQLite's online backup instead. It produces a single consistent file, safely, while the app keeps serving:

```bash
sqlite3 /srv/jata/data/jata.sqlite ".backup '/srv/jata/backups/jata-$(date +%F).sqlite'"
```

Inside a container, or anywhere without the CLI, `better-sqlite3` exposes the same API:

```bash
cd /srv/jata/app
DATABASE_PATH=/srv/jata/data/jata.sqlite \
node -e "const D=require('better-sqlite3');const s=new D(process.env.DATABASE_PATH);s.backup(process.argv[1]).then(()=>{s.close();console.log('backup ok');});" \
  /srv/jata/backups/jata-$(date +%F).sqlite
```

Run that from the app directory so `require('better-sqlite3')` resolves. Inside the container: `docker compose exec web sh -c '…'`.

Third option: stop the app, then copy. Clean and simple if a minute of downtime is acceptable — SQLite checkpoints and removes the sidecars when the last connection closes, so after a clean stop the main file is complete. The glob is there in case it did not.

```bash
sudo systemctl stop jata
sudo cp /srv/jata/data/jata.sqlite* /srv/jata/backups/
sudo systemctl start jata
```

### Nightly script

`/usr/local/bin/jata-backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

DB=/srv/jata/data/jata.sqlite
UPLOADS=/srv/jata/uploads
DEST=/srv/jata/backups
STAMP=$(date +%F-%H%M)
KEEP_DAYS=14

mkdir -p "$DEST"

# Consistent single-file database snapshot.
sqlite3 "$DB" ".backup '$DEST/jata-$STAMP.sqlite'"

# Verify before trusting it.
sqlite3 "$DEST/jata-$STAMP.sqlite" "PRAGMA integrity_check;" | grep -q '^ok$'

# Uploaded images.
tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"

# Retention.
find "$DEST" -name 'jata-*.sqlite'    -mtime +$KEEP_DAYS -delete
find "$DEST" -name 'uploads-*.tar.gz' -mtime +$KEEP_DAYS -delete

echo "[jata] backup complete: $STAMP"
```

```bash
sudo chmod +x /usr/local/bin/jata-backup.sh
sudo crontab -e
```

```cron
# nightly at 02:15 server time
15 2 * * * /usr/local/bin/jata-backup.sh >> /var/log/jata-backup.log 2>&1
```

`/srv/jata/backups` is on the same disk as the data, which protects you from mistakes but not from losing the server. Copy the files off-box — `rclone`, `restic`, `aws s3 cp`, or a cron'd `rsync` to another machine.

### Restore

```bash
# 1. stop the app so nothing is mid-write
sudo systemctl stop jata

# 2. keep the current state aside, including both sidecars
sudo mv /srv/jata/data/jata.sqlite     /srv/jata/data/jata.sqlite.broken
sudo rm -f /srv/jata/data/jata.sqlite-wal /srv/jata/data/jata.sqlite-shm

# 3. put the backup in place
sudo cp /srv/jata/backups/jata-2026-01-15-0215.sqlite /srv/jata/data/jata.sqlite
sudo chown jata:jata /srv/jata/data/jata.sqlite
sudo chmod 600 /srv/jata/data/jata.sqlite

# 4. uploads
sudo tar -xzf /srv/jata/backups/uploads-2026-01-15-0215.tar.gz -C /srv/jata/
sudo chown -R jata:jata /srv/jata/uploads

# 5. start the app again
sudo systemctl start jata
journalctl -u jata -n 50
```

Deleting the stale `-wal` and `-shm` in step 2 matters: leaving a WAL from a different database next to a restored file is asking for corruption.

**Test the restore before you need it.** Point a throwaway process at a copy of a backup on a spare port and confirm the dashboard shows real orders:

```bash
mkdir -p /tmp/restore-test
cp /srv/jata/backups/jata-2026-01-15-0215.sqlite /tmp/restore-test/jata.sqlite

cd /srv/jata/app
DATABASE_PATH=/tmp/restore-test/jata.sqlite NODE_ENV=production \
  node node_modules/next/dist/bin/next start -p 3001 -H 127.0.0.1
```

Port 3001 is on loopback and the firewall blocks it, so reach it with an SSH tunnel: `ssh -L 3001:127.0.0.1:3001 you@your-server`, then open <http://localhost:3001/ms/login> on your own machine. Stop it with Ctrl-C and delete `/tmp/restore-test` when you are done.

A backup you have never restored is a hypothesis.

---

## 11. Updating a deployed site

The schema bootstrap is idempotent — `CREATE TABLE IF NOT EXISTS` plus seeds guarded by row counts — so there is no migration step and an update will not touch your data. The seed will not re-run, because `categories` and `admin_users` are no longer empty.

**Build before you restart.** `next build` can fail on a type error or an OOM kill, and if you have already stopped the service you are down for the length of the debugging session. The old `.next` keeps serving while the new build runs.

```bash
cd /srv/jata/app

# 1. new code
sudo -u jata git pull origin main

# 2. dependencies, exactly as locked
sudo -u jata npm ci

# 3. build with the build-time variables (NEXT_PUBLIC_* gets inlined here)
sudo -u jata env NODE_ENV=production \
                 NEXT_PUBLIC_SITE_URL=https://jatacafe.co.ke \
                 npm run build

# 4. only now swap the process
sudo systemctl restart jata
sudo systemctl status jata
journalctl -u jata -n 50
curl -I https://jatacafe.co.ke/
```

Notes:

- Restart takes a second or two of 502s. For a cafe site that is fine; if it is not, run two instances on different ports with separate `.next` directories and switch nginx between them — but remember **only one process may open the database**, so this needs more care than a normal Next.js app. Simplicity is worth more here than zero downtime.
- `DATABASE_PATH` and `SEED_ADMIN_*` are runtime values: a restart is enough. `NEXT_PUBLIC_SITE_URL` and `GOOGLE_SITE_VERIFICATION` are both read from bundled code, so changing either means a rebuild.
- After a **Node major upgrade**, rerun `npm ci` so native modules are resolved against the new runtime.
- With Docker: `docker compose build && docker compose up -d`. Build first for the same reason — a failed build leaves the running container alone. Compose stops the old container before starting the new one, so there is a short gap and never two processes on the same database file.

---

## 12. Troubleshooting

**Login succeeds then bounces straight back to `/ms/login`, no error shown.**
You are serving over plain HTTP with `NODE_ENV=production`. The `jata_session` cookie is set with `secure: true`, the browser discards it, and the next request looks unauthenticated. Fix the TLS (§5.8). Same symptom if your proxy forwards `X-Forwarded-Proto: http`, or if a redirect drops the visitor from `https://` to `http://`. Confirm with browser devtools → Application → Cookies: no `jata_session` present means the cookie was rejected.

**`NODE_MODULE_VERSION` mismatch, or `invalid ELF header`, from `better-sqlite3`.**
The native binary does not match the running Node. Usually it means `node_modules` was built elsewhere — a different Node major, or a different OS entirely.

```bash
cd /srv/jata/app
rm -rf node_modules
npm ci
# if a prebuild is missing for your platform, compile it:
npm rebuild better-sqlite3 --build-from-source
```

Compiling needs `python3`, `make` and `g++`. Note that v13 ships Node-API prebuilds for Linux, macOS and Windows on x64 and arm64 (glibc and musl), so this is rarer than it used to be — platform mismatch is the likelier cause than ABI mismatch.

**`Something went wrong installing the "sharp" module`, or sharp cannot find its binaries.**
`node_modules` came from another platform. `sharp` installs platform-specific optional dependencies; Windows binaries do not run on Linux. Reinstall on the target: `rm -rf node_modules && npm ci`.

**`SQLITE_READONLY`, or `unable to open database file`.**
Permissions on the data directory, nine times out of ten.

```bash
ls -la /srv/jata/data                      # who owns it?
systemctl show jata -p User -p WorkingDirectory
sudo chown -R jata:jata /srv/jata/data /srv/jata/uploads
```

SQLite needs write access to the **directory**, not just the file, because it creates the `-wal` and `-shm` sidecars there. With Docker, the host directory must be owned by the container's uid (`1000` if you used `user: "1000:1000"`). With systemd, check that `ReadWritePaths` covers the path and that `ProtectSystem` is not shadowing it. On a platform volume, confirm the volume is actually mounted (`fly ssh console -C "df -h /data"`).

**Uploaded images disappear after a deploy or restart.**
`public/uploads` is still inside the checkout or the image layer rather than on the persistent volume. Fix with the bind mount in §5.5, the second volume in the compose file, or the entrypoint symlink in §7. Images already lost are gone unless they are in a backup — this is why §10 tars the uploads directory.

**`413 Request Entity Too Large` when uploading a photo.**
The reverse proxy is rejecting the body before it ever reaches Next. nginx defaults to 1 MB, and a modern phone photo is 3–8 MB. Set `client_max_body_size 15m;` in the `server` block (§5.8) and reload. Caddy: the `request_body` / `max_size` directive in §5.10. On Cloudflare, mind the plan's own upload cap.

**`SQLITE_BUSY: database is locked`.**
Two writers. `db.ts` sets `busy_timeout = 5000`, so brief contention resolves itself; persistent errors mean something genuinely concurrent. Check for a second app instance (`ps aux | grep next`), a scaled-up platform deployment (`fly scale count 1`), an open `sqlite3` shell holding a write transaction, or a backup job using `cp` instead of `.backup`. One process, one database file — that is the rule.

**Canonical URLs, `robots.txt` or `sitemap.xml` show `jatacafe.co.ke` when they should show your domain (or vice versa).**
`NEXT_PUBLIC_SITE_URL` was unset or wrong **at build time**, and the fallback got compiled in. All four consumers read it from the bundle. Fix the value and rebuild (§11); a restart alone will not help.

**`EACCES` writing `.next/cache/images`.**
The Next image optimiser caches optimised output under `.next/cache`. The runtime user needs write access there. On a VPS, `sudo chown -R jata:jata /srv/jata/app/.next`. In Docker, that is the `chown node:node .next` line in the Dockerfile.

**`Cannot find module '/srv/jata/app/scripts/reset-db.mjs'`.**
Expected. `npm run db:reset` references a script that is not in the repository. Use the manual file deletion in §4.4 — and remember that on a live server it destroys every order and customer.

**Build killed, or `JavaScript heap out of memory`.**
`next build` needs more RAM than the box has. Add swap (§5.6), or build elsewhere and ship `.next` — in which case ship the matching `node_modules` too, built on the same platform and Node version.

**Dashboard pages are getting cached or indexed.**
The `headers()` rule in `next.config.ts` that sets `noindex`/`no-store` is scoped by path prefix, and `robots.ts` has its own disallow list. If either still names the old dashboard prefix, `/ms` is served without protection. See §9 and the appendix.

---

## Appendix: configuration recommendations, not applied

These are deliberately left alone. Each is a one-line change you may want to make yourself.

| File | Suggestion | Why |
| --- | --- | --- |
| `src/app/robots.ts` | Add `/ms` and `/ms/` to the `disallow` array. | The current list names the pre-rename dashboard prefix, so the live dashboard path is not disallowed. |
| `next.config.ts` | Change the `headers()` entry with `X-Robots-Tag: noindex, nofollow` to `source: "/ms/:path*"`. | Same stale prefix; as written, dashboard responses get neither `noindex` nor `no-store`. |
| `src/components/site-footer.tsx` | Remove the staff-login link. | The dashboard is meant to be unlinked from the storefront. |
| `package.json` | Raise `engines.node` to `>=22.0.0`. | `better-sqlite3@13` already requires Node 22; the looser constraint invites someone to deploy on 20 and hit `EBADENGINE`. |
| `package.json` | Either add `scripts/reset-db.mjs` or drop the `db:reset` script. | It currently fails with a missing-module error. |
| `next.config.ts` | Optionally add `output: "standalone"`. | Smaller Docker images, at the cost of making sure file tracing picks up the `better-sqlite3` prebuilds and `sharp` binaries (`outputFileTracingIncludes`). |
| `next.config.ts` | Optionally add a cache header rule for `/uploads/:path*`. | Generated art under `/img/` is cached hard already; owner-uploaded images are not. |
| `.gitignore` | Add `.env.production` if you keep that filename. | §5.4 uses it for server secrets; only `.env`, `.env.local` and `.env*.local` are ignored today. |
| repo root | Add `.dockerignore`. | Required for the Docker path in §7, and absent today. |

---

## Quick reference

```bash
# status and logs
sudo systemctl status jata
journalctl -u jata -f
journalctl -u jata --since "1 hour ago" | grep -i error

# restart / stop / start
sudo systemctl restart jata

# deploy an update
cd /srv/jata/app && sudo -u jata git pull && sudo -u jata npm ci \
  && sudo -u jata env NODE_ENV=production NEXT_PUBLIC_SITE_URL=https://jatacafe.co.ke npm run build \
  && sudo systemctl restart jata

# backup now
sudo /usr/local/bin/jata-backup.sh

# inspect the database read-only
sqlite3 -readonly /srv/jata/data/jata.sqlite "SELECT COUNT(*) FROM orders;"

# is the port bound to loopback only?
sudo ss -tlnp | grep 3000

# nginx
sudo nginx -t && sudo systemctl reload nginx
sudo tail -f /var/log/nginx/error.log

# TLS expiry
sudo certbot certificates
```

| Thing | Value |
| --- | --- |
| Storefront | `/` |
| Dashboard | `/ms` |
| Dashboard login | `/ms/login` |
| Session cookie | `jata_session`, `httpOnly`, `sameSite=lax`, `secure` in production, 7 days |
| Login rate limit | 8 failures per email per 15 minutes |
| Database | `$DATABASE_PATH`, plus `-wal` and `-shm` sidecars |
| Uploads | `public/uploads` |
| Default port | 3000 |
| Node | 22 LTS or newer |

### Sources

- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables) — build-time inlining of `NEXT_PUBLIC_*`.
- [Fly.io community: volumes are not attached to the release command machine](https://community.fly.io/t/volume-not-available-in-release-command/6566/2).

*Content from external sources was rephrased for compliance with licensing restrictions.*
