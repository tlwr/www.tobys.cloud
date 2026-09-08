import type { Context } from "hono";
import { isLoopbackOrigin } from "@tobys/auth-client";

export const CHALLENGE_COOKIE = "webauthn_challenge";
export const CHALLENGE_TTL_SEC = 120;
export const RP_NAME = "auth.tobys.cloud";
export const PROD_RP_ID = "auth.tobys.cloud";

export type ChallengePurpose = "register" | "login";

export type WebAuthnChallenge = {
  purpose: ChallengePurpose;
  challenge: string;
  sub?: string;
  exp: number;
};

export type WebAuthnRp = {
  rpID: string;
  origin: string;
  rpName: string;
};

const enc = new TextEncoder();

function webcrypto(): Crypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto API is not available");
  }
  return c;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) {
    s += String.fromCharCode(b);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  return b64url(bytes);
}

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  return fromB64url(s) as Uint8Array<ArrayBuffer>;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return webcrypto().subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function userHandle(email: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await webcrypto().subtle.digest("SHA-256", enc.encode(email));
  return new Uint8Array(digest) as Uint8Array<ArrayBuffer>;
}

export function webAuthnRp(requestUrl: string): WebAuthnRp {
  const origin = new URL(requestUrl).origin;
  const host = new URL(origin).hostname;
  const rpID = isLoopbackOrigin(origin) ? host : PROD_RP_ID;
  return { rpID, origin, rpName: RP_NAME };
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

function writeCookie(c: Context, name: string, value: string, maxAge: number): void {
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

export async function signChallenge(
  secret: string,
  payload: {
    purpose: ChallengePurpose;
    challenge: string;
    sub?: string;
  },
): Promise<string> {
  const body: WebAuthnChallenge = {
    purpose: payload.purpose,
    challenge: payload.challenge,
    exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC,
    ...(payload.sub ? { sub: payload.sub } : {}),
  };
  const packed = b64url(enc.encode(JSON.stringify(body)));
  const key = await hmacKey(secret);
  const sig = await webcrypto().subtle.sign("HMAC", key, enc.encode(packed));
  return `${packed}.${b64url(sig)}`;
}

export async function verifyChallenge(
  secret: string,
  token: string,
): Promise<WebAuthnChallenge | null> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [packed, sig] = parts;
  const key = await hmacKey(secret);
  const ok = await webcrypto().subtle.verify(
    "HMAC",
    key,
    fromB64url(sig),
    enc.encode(packed),
  );
  if (!ok) {
    return null;
  }
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64url(packed)),
    ) as WebAuthnChallenge;
    if (
      (payload.purpose !== "register" && payload.purpose !== "login") ||
      typeof payload.challenge !== "string" ||
      !payload.challenge ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    if (payload.sub !== undefined && typeof payload.sub !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function setChallengeCookie(
  c: Context,
  secret: string,
  payload: {
    purpose: ChallengePurpose;
    challenge: string;
    sub?: string;
  },
): Promise<void> {
  const token = await signChallenge(secret, payload);
  writeCookie(c, CHALLENGE_COOKIE, token, CHALLENGE_TTL_SEC);
}

export async function readChallengeCookie(
  c: Context,
  secret: string,
): Promise<WebAuthnChallenge | null> {
  const token = readCookie(c, CHALLENGE_COOKIE);
  if (!token) {
    return null;
  }
  return verifyChallenge(secret, token);
}

export function clearChallengeCookie(c: Context): void {
  writeCookie(c, CHALLENGE_COOKIE, "", 0);
}
