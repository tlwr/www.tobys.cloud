import { describe, expect, it, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "./index";
import { AUDIT_PAGE_SIZE, writeAudit } from "./audit";
import type { Env } from "./env";
import { verifyAuthToken } from "@tobys/auth-client";

class MemoryKV {
  private store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
  async list() {
    return {
      keys: [...this.store.keys()].map((name) => ({ name })),
      list_complete: true as const,
      cacheStatus: null,
    };
  }
}

class MemoryD1 {
  events: {
    id: string;
    ts: number;
    type: string;
    email: string;
    actor: string | null;
    ip: string | null;
    ua: string | null;
  }[] = [];

  async batch(_statements: unknown[]) {
    return [];
  }

  prepare(sql: string) {
    const events = this.events;
    const paged = sql.includes("WHERE");
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            events.push({
              id: String(args[0]),
              ts: Number(args[1]),
              type: String(args[2]),
              email: String(args[3]),
              actor: args[4] == null ? null : String(args[4]),
              ip: args[5] == null ? null : String(args[5]),
              ua: args[6] == null ? null : String(args[6]),
            });
            return { success: true };
          },
          async all() {
            let rows = [...events].sort(
              (a, b) => b.ts - a.ts || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
            );
            if (paged) {
              const ts = Number(args[0]);
              const id = String(args[2]);
              const limit = Number(args[3]);
              rows = rows.filter(
                (r) => r.ts < ts || (r.ts === ts && r.id < id),
              );
              return { results: rows.slice(0, limit) };
            }
            return { results: rows.slice(0, Number(args[0])) };
          },
        };
      },
    };
  }
}

const SECRET = "test-jwt-secret-at-least-32-chars";

function env(
  users: MemoryKV,
  audit: MemoryD1 = new MemoryD1(),
): Env & { AUTH_JWT_SECRET: string } {
  return {
    USERS: users as unknown as KVNamespace,
    AUDIT: audit as unknown as D1Database,
    AUTH_JWT_SECRET: SECRET,
  };
}

async function loginCookie(
  users: MemoryKV,
  audit?: MemoryD1,
): Promise<string> {
  const res = await app.request(
    "/login",
    {
      method: "POST",
      body: new URLSearchParams({
        email: "toby@toby.codes",
        password: "s3cret",
      }),
      headers: { Origin: "http://localhost:8788" },
    },
    env(users, audit),
  );
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  return raw
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("auth.tobys.cloud", () => {
  let users: MemoryKV;

  beforeEach(async () => {
    users = new MemoryKV();
    await users.put(
      "toby@toby.codes",
      JSON.stringify({
        email: "toby@toby.codes",
        hashedPassword: await bcrypt.hash("s3cret", 4),
        permissions: ["auth:admin", "toby-codes:admin"],
      }),
    );
  });

  it("rejects unauthenticated admin", async () => {
    const res = await app.request("/", {}, env(users));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("logs in and lists users", async () => {
    const cookie = await loginCookie(users);
    const res = await app.request(
      "/",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      env(users),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("toby@toby.codes");
  });

  it("issues a ticket on authorize when logged in", async () => {
    const cookie = await loginCookie(users);
    const redirect = "https://www.toby.codes/auth/callback";
    const res = await app.request(
      `https://auth.tobys.cloud/authorize?client=toby-codes&redirect=${encodeURIComponent(redirect)}&next=/admin`,
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin).toBe("https://www.toby.codes");
    expect(loc.pathname).toBe("/auth/callback");
    const ticket = loc.searchParams.get("ticket") ?? "";
    const payload = await verifyAuthToken(SECRET, ticket, {
      aud: "toby-codes",
      typ: "ticket",
    });
    expect(payload?.sub).toBe("toby@toby.codes");
    expect(payload?.perms).toContain("toby-codes:admin");
  });

  it("rejects a localhost redirect when the issuer is production", async () => {
    const cookie = await loginCookie(users);
    const res = await app.request(
      `https://auth.tobys.cloud/authorize?client=toby-codes&redirect=${encodeURIComponent("http://localhost:8787/auth/callback")}`,
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(res.status).toBe(400);
  });

  it("allows a localhost redirect when the issuer is loopback", async () => {
    const cookie = await loginCookie(users);
    const redirect = "http://localhost:8787/auth/callback";
    const res = await app.request(
      `http://localhost:8788/authorize?client=toby-codes&redirect=${encodeURIComponent(redirect)}&next=/admin`,
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin).toBe("http://localhost:8787");
    expect(loc.pathname).toBe("/auth/callback");
  });

  it("forbids authorize without the client permission", async () => {
    await users.put(
      "guest@toby.codes",
      JSON.stringify({
        email: "guest@toby.codes",
        hashedPassword: await bcrypt.hash("s3cret", 4),
        permissions: [],
      }),
    );
    const login = await app.request(
      "/login",
      {
        method: "POST",
        body: new URLSearchParams({
          email: "guest@toby.codes",
          password: "s3cret",
        }),
        headers: { Origin: "http://localhost:8788" },
      },
      env(users),
    );
    const cookie = (typeof login.headers.getSetCookie === "function"
      ? login.headers.getSetCookie()
      : [login.headers.get("set-cookie") ?? ""]
    )
      .filter(Boolean)
      .map((c) => c.split(";")[0])
      .join("; ");
    const res = await app.request(
      `https://auth.tobys.cloud/authorize?client=toby-codes&redirect=${encodeURIComponent("https://www.toby.codes/auth/callback")}`,
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(res.status).toBe(403);
  });

  it("rejects redirect to an unknown origin", async () => {
    const cookie = await loginCookie(users);
    const res = await app.request(
      `https://auth.tobys.cloud/authorize?client=toby-codes&redirect=${encodeURIComponent("https://evil.example/auth/callback")}`,
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(res.status).toBe(400);
  });

  it("logs in directly to the admin UI when next is empty", async () => {
    const res = await app.request(
      "/login",
      {
        method: "POST",
        body: new URLSearchParams({
          email: "toby@toby.codes",
          password: "s3cret",
          next: "",
        }),
        headers: { Origin: "http://localhost:8788" },
      },
      env(users),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });

  it("treats /authorize without a client as a local login", async () => {
    const unauth = await app.request("/authorize", {}, env(users));
    expect(unauth.status).toBe(302);
    expect(unauth.headers.get("location")).toBe("/login?next=%2F");

    const cookie = await loginCookie(users);
    const authed = await app.request(
      "/authorize",
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(authed.status).toBe(302);
    expect(authed.headers.get("location")).toBe("/");
  });

  it("cannot delete the last auth admin", async () => {
    const cookie = await loginCookie(users);
    const res = await app.request(
      "/users/toby@toby.codes/delete",
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost:8788" },
      },
      env(users),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("last auth:admin");
    expect(await users.get("toby@toby.codes")).not.toBeNull();
  });

  it("rejects unauthenticated audit page", async () => {
    const res = await app.request("/audit", {}, env(users));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("records login success and failure with the email", async () => {
    const audit = new MemoryD1();
    await app.request(
      "/login",
      {
        method: "POST",
        body: new URLSearchParams({
          email: "toby@toby.codes",
          password: "wrong",
        }),
        headers: {
          Origin: "http://localhost:8788",
          "CF-Connecting-IP": "203.0.113.9",
        },
      },
      env(users, audit),
    );
    const cookie = await loginCookie(users, audit);
    const res = await app.request(
      "/audit",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      env(users, audit),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("login.success");
    expect(html).toContain("login.failure");
    expect(html).toContain("toby@toby.codes");
    expect(html).toContain("203.0.113.9");
    const successAt = html.indexOf("login.success");
    const failureAt = html.indexOf("login.failure");
    expect(successAt).toBeGreaterThan(-1);
    expect(failureAt).toBeGreaterThan(successAt);
  });

  it("records logout from the admin form", async () => {
    const audit = new MemoryD1();
    const cookie = await loginCookie(users, audit);
    await app.request(
      "/logout",
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost:8788" },
      },
      env(users, audit),
    );
    const again = await loginCookie(users, audit);
    const res = await app.request(
      "/audit",
      { headers: { Cookie: again, Origin: "http://localhost:8788" } },
      env(users, audit),
    );
    const html = await res.text();
    expect(html).toContain("logout");
    expect(html).toContain("toby@toby.codes");
  });

  it("records who created a user and the new email", async () => {
    const audit = new MemoryD1();
    const cookie = await loginCookie(users, audit);
    const create = await app.request(
      "/users/new",
      {
        method: "POST",
        body: new URLSearchParams({
          email: "new@toby.codes",
          password: "longenough",
          permissions: "toby-codes:admin",
        }),
        headers: { Cookie: cookie, Origin: "http://localhost:8788" },
      },
      env(users, audit),
    );
    expect(create.status).toBe(302);
    const again = await loginCookie(users, audit);
    const res = await app.request(
      "/audit",
      { headers: { Cookie: again, Origin: "http://localhost:8788" } },
      env(users, audit),
    );
    const html = await res.text();
    expect(html).toContain("user.create");
    expect(html).toContain("new@toby.codes");
    expect(html).toContain("toby@toby.codes");
    expect(await users.get("new@toby.codes")).not.toBeNull();
  });

  it("paginates audit events newest first", async () => {
    const audit = new MemoryD1();
    const e = env(users, audit);
    const start = Date.now();
    for (let i = 0; i < AUDIT_PAGE_SIZE + 2; i += 1) {
      await writeAudit(e.AUDIT, {
        type: i % 2 === 0 ? "login.success" : "login.failure",
        email: `user${i}@toby.codes`,
        ts: start + i,
      });
    }
    const cookie = await loginCookie(users, audit);
    const first = await app.request(
      "/audit",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      e,
    );
    const firstHtml = await first.text();
    expect(firstHtml).toContain("Older");
    expect(firstHtml).toContain(`user${AUDIT_PAGE_SIZE + 1}@toby.codes`);
    expect(firstHtml).not.toContain("user0@toby.codes");
    const href = firstHtml.match(/\/audit\?cursor=([^"]+)/)?.[1];
    expect(href).toBeTruthy();
    const second = await app.request(
      `/audit?cursor=${href}`,
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      e,
    );
    const secondHtml = await second.text();
    expect(secondHtml).toContain("user0@toby.codes");
  });
});
