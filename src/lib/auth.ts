import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { hashPassword, verifyPassword } from "./password";
import type { AdminUser } from "./types";

const COOKIE_NAME = "jata_session";
const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MINUTES = 15;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await sql`
    insert into sessions (token_hash, user_id, expires_at)
    values (${sha256(token)}, ${userId}, ${expires})
  `;

  // Housekeeping: drop anything already expired.
  await sql`delete from sessions where expires_at < now()`;

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await sql`delete from sessions where token_hash = ${sha256(token)}`;
  }
  jar.delete(COOKIE_NAME);
}

export type SessionUser = Pick<
  AdminUser,
  "id" | "email" | "name" | "role" | "must_change_password"
>;

/** Resolve the signed-in admin, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await sql<SessionUser[]>`
    select u.id,
           u.email,
           u.name,
           u.role,
           u.must_change_password::int as must_change_password
      from sessions s
      join admin_users u on u.id = s.user_id
     where s.token_hash = ${sha256(token)}
       and s.expires_at > now()
  `;

  return rows[0] ?? null;
}

/**
 * Gate for every admin page and server action. This is the single place that
 * decides whether a request is allowed into the dashboard.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/ms/login");
  return user;
}

/* ------------------------------------------------------------------ *
 * Login
 * ------------------------------------------------------------------ */

async function tooManyAttempts(identifier: string): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n
      from login_attempts
     where identifier = ${identifier}
       and created_at > now() - make_interval(mins => ${ATTEMPT_WINDOW_MINUTES})
  `;
  return rows[0].n >= MAX_ATTEMPTS;
}

async function recordAttempt(identifier: string): Promise<void> {
  await sql`insert into login_attempts (identifier) values (${identifier})`;
  await sql`
    delete from login_attempts
     where created_at < now() - interval '1 day'
  `;
}

export type LoginResult = { ok: true; userId: number } | { ok: false; error: string };

export async function attemptLogin(emailRaw: string, password: string): Promise<LoginResult> {
  const email = (emailRaw || "").trim().toLowerCase();
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  if (await tooManyAttempts(email)) {
    return {
      ok: false,
      error: `Too many attempts. Wait ${ATTEMPT_WINDOW_MINUTES} minutes and try again.`,
    };
  }

  const users = await sql<{ id: number; password_hash: string }[]>`
    select id, password_hash from admin_users where email = ${email}
  `;
  const user = users[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    await recordAttempt(email);
    return { ok: false, error: "Email or password is not correct." };
  }

  await sql`update admin_users set last_login_at = now() where id = ${user.id}`;
  await sql`delete from login_attempts where identifier = ${email}`;

  return { ok: true, userId: user.id };
}

/* ------------------------------------------------------------------ *
 * Password management
 * ------------------------------------------------------------------ */

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (!/[a-z]/.test(password)) return "Include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Include an uppercase letter.";
  if (!/\d/.test(password)) return "Include a number.";
  return null;
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const users = await sql<{ password_hash: string }[]>`
    select password_hash from admin_users where id = ${userId}
  `;
  const user = users[0];

  if (!user) return { ok: false, error: "Account not found." };
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return { ok: false, error: "Your current password is not correct." };
  }

  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };

  await sql`
    update admin_users
       set password_hash = ${hashPassword(newPassword)},
           must_change_password = false
     where id = ${userId}
  `;

  // Force a fresh login everywhere else.
  await sql`delete from sessions where user_id = ${userId}`;

  return { ok: true };
}
