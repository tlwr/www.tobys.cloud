export const RATELIMIT_PREFIX = "ratelimit:";
export const LOGIN_MAX_ATTEMPTS = 8;
export const LOGIN_WINDOW_SEC = 15 * 60;

type Bucket = { count: number; resetAt: number };

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function ipKey(ip: string): string {
  return `${RATELIMIT_PREFIX}ip:${ip || "unknown"}`;
}

function emailKey(email: string): string {
  return `${RATELIMIT_PREFIX}email:${email}`;
}

async function readBucket(kv: KVNamespace, key: string): Promise<Bucket | null> {
  const raw = await kv.get(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Bucket;
    if (
      typeof parsed.count !== "number" ||
      typeof parsed.resetAt !== "number" ||
      parsed.resetAt <= nowSec()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeBucket(kv: KVNamespace, key: string, bucket: Bucket): Promise<void> {
  const ttl = Math.max(60, bucket.resetAt - nowSec());
  await kv.put(key, JSON.stringify(bucket), { expirationTtl: ttl });
}

/** True when this IP or email has used its failed-login budget. */
export async function loginLimited(
  kv: KVNamespace,
  ip: string | null,
  email: string,
): Promise<boolean> {
  const keys = [ipKey(ip ?? "")];
  if (email) {
    keys.push(emailKey(email));
  }
  for (const key of keys) {
    const bucket = await readBucket(kv, key);
    if (bucket && bucket.count >= LOGIN_MAX_ATTEMPTS) {
      return true;
    }
  }
  return false;
}

export async function noteLoginFailure(
  kv: KVNamespace,
  ip: string | null,
  email: string,
): Promise<void> {
  const keys = [ipKey(ip ?? "")];
  if (email) {
    keys.push(emailKey(email));
  }
  const now = nowSec();
  for (const key of keys) {
    const existing = await readBucket(kv, key);
    const bucket: Bucket = existing
      ? { count: existing.count + 1, resetAt: existing.resetAt }
      : { count: 1, resetAt: now + LOGIN_WINDOW_SEC };
    await writeBucket(kv, key, bucket);
  }
}

export async function noteLoginSuccess(
  kv: KVNamespace,
  ip: string | null,
  email: string,
): Promise<void> {
  await kv.delete(ipKey(ip ?? ""));
  if (email) {
    await kv.delete(emailKey(email));
  }
}
