export type TokenTyp = "ticket" | "session";

export type AuthPayload = {
  sub: string;
  aud: string;
  perms: string[];
  typ: TokenTyp;
  iat: number;
  exp: number;
};

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) {
    s += String.fromCharCode(b);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(enc.encode(JSON.stringify(obj)));
}

function fromB64url(s: string): ArrayBuffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out.buffer;
}

function webcrypto(): Crypto {
  // Workers types expose `crypto` as a global, not on `typeof globalThis`.
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto API is not available");
  }
  return c;
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

export async function signAuthToken(
  secret: string,
  payload: AuthPayload,
): Promise<string> {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const body = b64urlJson(payload);
  const data = `${header}.${body}`;
  const key = await hmacKey(secret);
  const sig = await webcrypto().subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verifyAuthToken(
  secret: string,
  token: string,
  opts: { aud: string; typ: TokenTyp },
): Promise<AuthPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const key = await hmacKey(secret);
  const ok = await webcrypto().subtle.verify(
    "HMAC",
    key,
    fromB64url(sig),
    enc.encode(data),
  );
  if (!ok) {
    return null;
  }
  let payload: AuthPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as AuthPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return null;
  }
  if (payload.aud !== opts.aud || payload.typ !== opts.typ) {
    return null;
  }
  if (typeof payload.sub !== "string" || !Array.isArray(payload.perms)) {
    return null;
  }
  return payload;
}

export function issuePayload(
  email: string,
  aud: string,
  perms: string[],
  typ: TokenTyp,
  ttlSec: number,
): AuthPayload {
  const iat = Math.floor(Date.now() / 1000);
  return { sub: email, aud, perms, typ, iat, exp: iat + ttlSec };
}

export const TICKET_TTL_SEC = 120;
export const SESSION_TTL_SEC = 86400;
