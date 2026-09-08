import type { Context } from "hono";
import {
  authorizeUrl,
  clearSession as clear,
  getIsLoggedIn as gi,
  handleCallback,
  logoutUrl,
  requireAuth as req,
} from "@tobys/auth-client";

const CLIENT = "toby-codes" as const;

export const requireAuth = req(CLIENT);

export async function getIsLoggedIn(c: Context): Promise<boolean> {
  return gi(c, CLIENT);
}

export function clearSession(c: Context): void {
  clear(c);
}

export async function handleAuthCallback(c: Context): Promise<Response> {
  return handleCallback(c, CLIENT);
}

export function logoutAndRedirect(c: Context): Response {
  clear(c);
  return c.redirect(logoutUrl(c, "/"));
}

export function loginRedirect(c: Context, next = "/"): Response {
  return c.redirect(authorizeUrl(c, CLIENT, next));
}
