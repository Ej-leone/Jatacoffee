import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, hashPassword, verifyPassword } from "./db";
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

  db()
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), userId, expires.toISOString());

  // Housekeeping: drop anything already expired.
  db().prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

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
    db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
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

  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.must_change_password
         FROM sessions s
         JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .get(sha256(token)) as SessionUser | undefined;

  return row ?? null;
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

function tooManyAttempts(identifier: string): boolean {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
        WHERE identifier = ?
          AND created_at > datetime('now', ?)`,
    )
    .get(identifier, `-${ATTEMPT_WINDOW_MINUTES} minutes`) as { n: number };
  return row.n >= MAX_ATTEMPTS;
}

function recordAttempt(identifier: string): void {
  db().prepare("INSERT INTO login_attempts (identifier) VALUES (?)").run(identifier);
  db()
    .prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')")
    .run();
}

export type LoginResult = { ok: true; userId: number } | { ok: false; error: string };

export function attemptLogin(emailRaw: string, password: string): LoginResult {
  const email = (emailRaw || "").trim().toLowerCase();
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  if (tooManyAttempts(email)) {
    return {
      ok: false,
      error: `Too many attempts. Wait ${ATTEMPT_WINDOW_MINUTES} minutes and try again.`,
    };
  }

  const user = db()
    .prepare("SELECT id, password_hash FROM admin_users WHERE email = ?")
    .get(email) as { id: number; password_hash: string } | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordAttempt(email);
    return { ok: false, error: "Email or password is not correct." };
  }

  db()
    .prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?")
    .run(user.id);
  db().prepare("DELETE FROM login_attempts WHERE identifier = ?").run(email);

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

export function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): { ok: true } | { ok: false; error: string } {
  const user = db()
    .prepare("SELECT password_hash FROM admin_users WHERE id = ?")
    .get(userId) as { password_hash: string } | undefined;

  if (!user) return { ok: false, error: "Account not found." };
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return { ok: false, error: "Your current password is not correct." };
  }

  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };

  db()
    .prepare(
      "UPDATE admin_users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
    )
    .run(hashPassword(newPassword), userId);

  // Force a fresh login everywhere else.
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

  return { ok: true };
}
