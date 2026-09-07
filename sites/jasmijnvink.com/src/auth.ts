import type { Context, Next } from "hono";
import {
  deleteCookie,
  getSignedCookie,
  setSignedCookie,
} from "hono/cookie";
import bcrypt from "bcryptjs";
import { UserSchema } from "./schemas/user";
import type { Env } from "./env";

type AppContext = Context<{ Bindings: Env }>;

export function getSessionSecret(c: AppContext): string | null {
  const secret = c.env.SESSION_SECRET?.trim();
  return secret ? secret : null;
}

export function requireSessionSecret(c: AppContext): string {
  const secret = getSessionSecret(c);
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. For remote: npm run set-session-secret. For local: npm run ensure-dev-vars.",
    );
  }
  return secret;
}

export async function getLoggedInUsername(
  c: AppContext,
): Promise<string | null> {
  const sessionSecret = getSessionSecret(c);
  if (!sessionSecret) {
    return null;
  }
  const username = await getSignedCookie(c, sessionSecret, "username");
  if (username === false || !username) {
    return null;
  }
  return username;
}

export async function getIsLoggedIn(c: AppContext): Promise<boolean> {
  return (await getLoggedInUsername(c)) !== null;
}

export async function loginUser(
  c: AppContext,
  username: string,
  password: string,
  rememberMe = false,
): Promise<boolean> {
  username = username.trim();
  password = password.trim();
  if (!username || !password) {
    return false;
  }

  const sessionSecret = requireSessionSecret(c);

  const userData = await c.env.USERS.get(username);
  if (!userData) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(userData);
  } catch {
    return false;
  }

  const userParse = UserSchema.safeParse(parsed);
  if (!userParse.success) {
    console.error("Invalid user data in KV:", userParse.error);
    return false;
  }

  const ok = await bcrypt.compare(password, userParse.data.hashedPassword);
  if (!ok) {
    return false;
  }

  const secure = new URL(c.req.url).protocol === "https:";
  const options = {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    maxAge: rememberMe ? 60 * 60 * 24 * 30 : 86400,
    path: "/",
  };

  await Promise.all([
    setSignedCookie(c, "username", username, sessionSecret, options),
    setSignedCookie(
      c,
      "loggedInAt",
      Date.now().toString(),
      sessionSecret,
      options,
    ),
  ]);

  return true;
}

export function clearSession(c: AppContext): void {
  deleteCookie(c, "username", { path: "/" });
  deleteCookie(c, "loggedInAt", { path: "/" });
}

export async function requireAuth(
  c: AppContext,
  next: Next,
): Promise<Response | void> {
  if (await getIsLoggedIn(c)) {
    await next();
    return;
  }
  return c.redirect("/inloggen");
}
