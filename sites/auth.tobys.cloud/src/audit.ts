export const AUDIT_PAGE_SIZE = 50;

export type AuditType =
  | "login.success"
  | "login.failure"
  | "logout"
  | "user.create";

export type AuditEvent = {
  id: string;
  ts: number;
  type: AuditType;
  email: string;
  actor: string | null;
  ip: string | null;
  ua: string | null;
};

export function encodeAuditCursor(event: AuditEvent): string {
  return btoa(`${event.ts}|${event.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeAuditCursor(
  raw: string | undefined,
): { ts: number; id: string } | null {
  if (!raw) {
    return null;
  }
  try {
    const pad = "=".repeat((4 - (raw.length % 4)) % 4);
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const [ts, id] = atob(b64).split("|");
    const n = Number(ts);
    if (!id || !Number.isFinite(n)) {
      return null;
    }
    return { ts: n, id };
  } catch {
    return null;
  }
}

function requestIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "";
  return ip || null;
}

function requestUa(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const ua = c.req.header("User-Agent") ?? "";
  if (!ua) {
    return null;
  }
  return ua.length > 240 ? `${ua.slice(0, 237)}...` : ua;
}

export function auditMeta(c: {
  req: { header: (name: string) => string | undefined };
}): { ip: string | null; ua: string | null } {
  return { ip: requestIp(c), ua: requestUa(c) };
}

async function ensureAuditSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      email TEXT NOT NULL,
      actor TEXT,
      ip TEXT,
      ua TEXT
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS audit_events_ts_id ON audit_events (ts, id)",
    ),
  ]);
  try {
    await db.prepare("ALTER TABLE audit_events ADD COLUMN actor TEXT").run();
  } catch {
    // column already exists
  }
}

export async function writeAudit(
  db: D1Database | undefined,
  event: {
    type: AuditType;
    email: string;
    actor?: string | null;
    ip?: string | null;
    ua?: string | null;
    ts?: number;
  },
): Promise<void> {
  if (!db) {
    return;
  }
  try {
    await ensureAuditSchema(db);
    await db
      .prepare(
        "INSERT INTO audit_events (id, ts, type, email, actor, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        event.ts ?? Date.now(),
        event.type,
        event.email,
        event.actor ?? null,
        event.ip ?? null,
        event.ua ?? null,
      )
      .run();
  } catch (err) {
    console.error("audit write failed", err);
  }
}

export async function listAudit(
  db: D1Database | undefined,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ events: AuditEvent[]; nextCursor: string | null }> {
  if (!db) {
    throw new Error(
      "AUDIT D1 binding is missing — set binding = \"AUDIT\" in wrangler.toml",
    );
  }
  await ensureAuditSchema(db);
  const limit = Math.min(Math.max(opts.limit ?? AUDIT_PAGE_SIZE, 1), 100);
  const cursor = decodeAuditCursor(opts.cursor);
  const fetch = limit + 1;

  const result = cursor
    ? await db
        .prepare(
          `SELECT id, ts, type, email, actor, ip, ua FROM audit_events
           WHERE ts < ? OR (ts = ? AND id < ?)
           ORDER BY ts DESC, id DESC
           LIMIT ?`,
        )
        .bind(cursor.ts, cursor.ts, cursor.id, fetch)
        .all<AuditEvent>()
    : await db
        .prepare(
          `SELECT id, ts, type, email, actor, ip, ua FROM audit_events
           ORDER BY ts DESC, id DESC
           LIMIT ?`,
        )
        .bind(fetch)
        .all<AuditEvent>();

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const last = events[events.length - 1];
  return {
    events,
    nextCursor: hasMore && last ? encodeAuditCursor(last) : null,
  };
}
