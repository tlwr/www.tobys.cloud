import type { Context, Next } from "hono";
// Bindings are per-app; only AUTH_* fields are read.
// Cookie helpers are local so Wrangler can bundle this package without
// resolving `hono/cookie` from packages/auth-client/node_modules.
import {
  AUTH_CLIENTS,
  originAllowed,
  type AuthClientId,
} from "./clients";
import {
  SESSION_TTL_SEC,
  TICKET_TTL_SEC,
  issuePayload,
  signAuthToken,
  verifyAuthToken,
  type AuthPayload,
} from "./jwt";

export const SESSION_COOKIE = "auth_session";

export type AuthEnv = {
  AUTH_JWT_SECRET?: string;
  AUTH_ISSUER?: string;
};

function envOf(c: Context): AuthEnv {
  return c.env as AuthEnv;
}

function readCookie(c: Context, name: string): string | null {
  const header = c.req.header("Cookie");
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function writeCookie(
  c: Context,
  name: string,
  value: string,
  maxAge: number,
): void {
  const secure = new URL(c.req.url).protocol === "https:";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) {
    parts.push("Secure");
  }
  c.header("Set-Cookie", parts.join("; "), { append: true });
}

export function getIssuer(c: Context): string {
  return (envOf(c).AUTH_ISSUER ?? "https://auth.tobys.cloud").replace(/\/$/, "");
}

export function getJwtSecret(c: Context): string | null {
  const s = envOf(c).AUTH_JWT_SECRET?.trim();
  return s ? s : null;
}

export async function getIdentity(
  c: Context,
  aud: AuthClientId,
): Promise<AuthPayload | null> {
  const secret = getJwtSecret(c);
  if (!secret) {
    return null;
  }
  const token = readCookie(c, SESSION_COOKIE);
  if (!token) {
    return null;
  }
  return verifyAuthToken(secret, token, { aud, typ: "session" });
}

export async function getIsLoggedIn(
  c: Context,
  aud: AuthClientId,
): Promise<boolean> {
  const id = await getIdentity(c, aud);
  return id !== null;
}

export function hasPermission(id: AuthPayload | null, perm: string): boolean {
  return id !== null && id.perms.includes(perm);
}

export function authorizeUrl(
  c: Context,
  client: AuthClientId,
  nextPath: string,
): string {
  const issuer = getIssuer(c);
  const origin = new URL(c.req.url).origin;
  const redirect = `${origin}/auth/callback`;
  const params = new URLSearchParams({
    client,
    redirect,
    next: nextPath.startsWith("/") ? nextPath : "/",
  });
  return `${issuer}/authorize?${params.toString()}`;
}

export function logoutUrl(c: Context, nextPath = "/"): string {
  const issuer = getIssuer(c);
  const origin = new URL(c.req.url).origin;
  const params = new URLSearchParams({
    redirect: `${origin}${nextPath.startsWith("/") ? nextPath : "/"}`,
  });
  return `${issuer}/logout?${params.toString()}`;
}

export function clearSession(c: Context): void {
  writeCookie(c, SESSION_COOKIE, "", 0);
}

export async function setSessionCookie(
  c: Context,
  payload: AuthPayload,
): Promise<void> {
  const secret = getJwtSecret(c);
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is not set");
  }
  const session = issuePayload(
    payload.sub,
    payload.aud,
    payload.perms,
    "session",
    SESSION_TTL_SEC,
  );
  const jwt = await signAuthToken(secret, session);
  writeCookie(c, SESSION_COOKIE, jwt, SESSION_TTL_SEC);
}

/** For the auth Worker itself — login is local, not a cross-origin authorize. */
export function requireLocalAuth(permission = "auth:admin") {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const id = await getIdentity(c, "auth");
    if (id && hasPermission(id, permission)) {
      await next();
      return;
    }
    if (id && !hasPermission(id, permission)) {
      return c.text("Forbidden", 403);
    }
    const nextPath = new URL(c.req.url).pathname + new URL(c.req.url).search;
    return c.redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  };
}

export function requireAuth(client: AuthClientId, permission?: string) {
  const perm = permission ?? AUTH_CLIENTS[client].permission;
  return async (c: Context, next: Next): Promise<Response | void> => {
    const id = await getIdentity(c, client);
    if (id && hasPermission(id, perm)) {
      await next();
      return;
    }
    if (id && !hasPermission(id, perm)) {
      return c.text("Forbidden", 403);
    }
    const nextPath = new URL(c.req.url).pathname + new URL(c.req.url).search;
    return c.redirect(authorizeUrl(c, client, nextPath));
  };
}

export async function handleCallback(
  c: Context,
  client: AuthClientId,
): Promise<Response> {
  const secret = getJwtSecret(c);
  if (!secret) {
    return c.text("AUTH_JWT_SECRET is not set", 500);
  }
  const ticket = c.req.query("ticket") ?? "";
  const next = c.req.query("next") ?? "/";
  const payload = await verifyAuthToken(secret, ticket, {
    aud: client,
    typ: "ticket",
  });
  if (!payload) {
    return c.redirect(authorizeUrl(c, client, next));
  }
  if (!originAllowed(client, new URL(c.req.url).origin)) {
    return c.text("Invalid origin", 400);
  }
  await setSessionCookie(c, payload);
  const path = next.startsWith("/") ? next : "/";
  return c.redirect(path);
}

export async function signTicket(
  secret: string,
  email: string,
  client: AuthClientId,
  perms: string[],
): Promise<string> {
  const payload = issuePayload(
    email,
    client,
    perms,
    "ticket",
    TICKET_TTL_SEC,
  );
  return signAuthToken(secret, payload);
}
