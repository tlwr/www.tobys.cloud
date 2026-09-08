import { ALL_PERMISSIONS } from "@tobys/auth-client";

export const PASSKEY_KEY_PREFIX = "passkey:";

export type StoredPasskey = {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
};

export type User = {
  email: string;
  hashedPassword: string;
  permissions: string[];
  passkey?: StoredPasskey;
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RX.test(email) && email.length <= 200;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parsePasskey(raw: unknown): StoredPasskey | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const p = raw as Record<string, unknown>;
  if (
    typeof p.id !== "string" ||
    !p.id ||
    p.id.length > 256 ||
    typeof p.publicKey !== "string" ||
    !p.publicKey ||
    typeof p.counter !== "number" ||
    !Number.isFinite(p.counter) ||
    p.counter < 0
  ) {
    return undefined;
  }
  const transports = Array.isArray(p.transports)
    ? p.transports.filter((t): t is string => typeof t === "string" && t.length > 0)
    : undefined;
  return {
    id: p.id,
    publicKey: p.publicKey,
    counter: p.counter,
    ...(transports && transports.length > 0 ? { transports } : {}),
  };
}

export function parseUser(raw: string | null): User | null {
  if (!raw) {
    return null;
  }
  try {
    const u = JSON.parse(raw) as User;
    if (typeof u.email !== "string" || typeof u.hashedPassword !== "string") {
      return null;
    }
    const passkey = parsePasskey(u.passkey);
    return {
      email: u.email,
      hashedPassword: u.hashedPassword,
      permissions: Array.isArray(u.permissions)
        ? u.permissions.filter((p) => typeof p === "string")
        : [],
      ...(passkey ? { passkey } : {}),
    };
  } catch {
    return null;
  }
}

export function passkeyIndexKey(credentialId: string): string {
  return `${PASSKEY_KEY_PREFIX}${credentialId}`;
}

export function sanitizePermissions(perms: string[]): string[] {
  const allowed = new Set(ALL_PERMISSIONS);
  return [...new Set(perms.filter((p) => allowed.has(p)))].sort();
}

export async function getUser(
  kv: KVNamespace,
  email: string,
): Promise<User | null> {
  return parseUser(await kv.get(normalizeEmail(email)));
}

export async function putUser(kv: KVNamespace, user: User): Promise<void> {
  const email = normalizeEmail(user.email);
  const passkey = parsePasskey(user.passkey);
  await kv.put(
    email,
    JSON.stringify({
      email,
      hashedPassword: user.hashedPassword,
      permissions: sanitizePermissions(user.permissions),
      ...(passkey ? { passkey } : {}),
    }),
  );
}

export async function deleteUser(kv: KVNamespace, email: string): Promise<void> {
  const user = await getUser(kv, email);
  if (user?.passkey) {
    await kv.delete(passkeyIndexKey(user.passkey.id));
  }
  await kv.delete(normalizeEmail(email));
}

export async function getEmailByPasskeyId(
  kv: KVNamespace,
  credentialId: string,
): Promise<string | null> {
  if (!credentialId || credentialId.length > 256) {
    return null;
  }
  const raw = await kv.get(passkeyIndexKey(credentialId));
  if (!raw) {
    return null;
  }
  const email = normalizeEmail(raw);
  return email || null;
}

export async function setPasskeyIndex(
  kv: KVNamespace,
  credentialId: string,
  email: string,
): Promise<void> {
  await kv.put(passkeyIndexKey(credentialId), normalizeEmail(email));
}

export async function deletePasskeyIndex(
  kv: KVNamespace,
  credentialId: string,
): Promise<void> {
  await kv.delete(passkeyIndexKey(credentialId));
}

export async function replaceUserPasskey(
  kv: KVNamespace,
  user: User,
  passkey: StoredPasskey | undefined,
): Promise<User> {
  const next: User = { ...user };
  if (user.passkey && user.passkey.id !== passkey?.id) {
    await deletePasskeyIndex(kv, user.passkey.id);
  }
  if (passkey) {
    next.passkey = passkey;
    await setPasskeyIndex(kv, passkey.id, user.email);
  } else {
    delete next.passkey;
  }
  await putUser(kv, next);
  return next;
}

export async function listUsers(kv: KVNamespace): Promise<User[]> {
  const out: User[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await kv.list(cursor ? { cursor } : undefined);
    for (const key of page.keys) {
      if (key.name.startsWith(PASSKEY_KEY_PREFIX)) {
        continue;
      }
      const u = await getUser(kv, key.name);
      if (u) {
        out.push(u);
      }
    }
    if (page.list_complete) {
      break;
    }
    cursor = page.cursor;
  }
  out.sort((a, b) => a.email.localeCompare(b.email));
  return out;
}

export async function countAuthAdmins(kv: KVNamespace): Promise<number> {
  const users = await listUsers(kv);
  return users.filter((u) => u.permissions.includes("auth:admin")).length;
}
