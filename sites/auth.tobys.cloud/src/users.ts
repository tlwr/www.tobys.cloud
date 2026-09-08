import { ALL_PERMISSIONS } from "@tobys/auth-client";

export type User = {
  email: string;
  hashedPassword: string;
  permissions: string[];
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RX.test(email) && email.length <= 200;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
    return {
      email: u.email,
      hashedPassword: u.hashedPassword,
      permissions: Array.isArray(u.permissions)
        ? u.permissions.filter((p) => typeof p === "string")
        : [],
    };
  } catch {
    return null;
  }
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
  await kv.put(
    email,
    JSON.stringify({
      email,
      hashedPassword: user.hashedPassword,
      permissions: sanitizePermissions(user.permissions),
    }),
  );
}

export async function deleteUser(kv: KVNamespace, email: string): Promise<void> {
  await kv.delete(normalizeEmail(email));
}

export async function listUsers(kv: KVNamespace): Promise<User[]> {
  const out: User[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await kv.list(cursor ? { cursor } : undefined);
    for (const key of page.keys) {
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
