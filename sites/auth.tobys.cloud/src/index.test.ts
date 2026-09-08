import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { app } from "./index";
import { AUDIT_PAGE_SIZE, writeAudit } from "./audit";
import type { Env } from "./env";
import { verifyAuthToken } from "@tobys/auth-client";
import { listUsers, parseUser } from "./users";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return {
    ...actual,
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  };
});

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
    detail: string | null;
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
              detail: args[7] == null ? null : String(args[7]),
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

function cookiesOf(res: Response): string {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  return raw
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");
}

function mergeCookies(...parts: string[]): string {
  const map = new Map<string, string>();
  for (const part of parts.join("; ").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      continue;
    }
    map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
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
  return cookiesOf(res);
}

const dummyCredential = {
  id: "cred-1",
  rawId: "cred-1",
  type: "public-key",
  response: {
    clientDataJSON: "e30",
    attestationObject: "e30",
    authenticatorData: "e30",
    signature: "e30",
  },
  clientExtensionResults: {},
};

function mockRegisterVerified(id = "cred-1") {
  vi.mocked(verifyRegistrationResponse).mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id,
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ["internal"],
      },
    },
  } as Awaited<ReturnType<typeof verifyRegistrationResponse>>);
}

function mockAuthVerified(id = "cred-1", newCounter = 1) {
  vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
    verified: true,
    authenticationInfo: {
      credentialID: id,
      newCounter,
      userVerified: true,
    },
  } as Awaited<ReturnType<typeof verifyAuthenticationResponse>>);
}

describe("auth.tobys.cloud", () => {
  let users: MemoryKV;

  beforeEach(async () => {
    vi.mocked(verifyRegistrationResponse).mockReset();
    vi.mocked(verifyAuthenticationResponse).mockReset();
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

  it("rejects unauthenticated /me", async () => {
    const res = await app.request("/me", {}, env(users));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain("next=");
  });

  it("lets a signed-in user without auth:admin view /me", async () => {
    await users.put(
      "guest@toby.codes",
      JSON.stringify({
        email: "guest@toby.codes",
        hashedPassword: await bcrypt.hash("s3cret", 4),
        permissions: ["toby-codes:admin"],
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
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe("/me");
    const cookie = (typeof login.headers.getSetCookie === "function"
      ? login.headers.getSetCookie()
      : [login.headers.get("set-cookie") ?? ""]
    )
      .filter(Boolean)
      .map((c) => c.split(";")[0])
      .join("; ");
    const me = await app.request(
      "/me",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      env(users),
    );
    expect(me.status).toBe(200);
    const html = await me.text();
    expect(html).toContain("guest@toby.codes");
    expect(html).toContain("toby-codes:admin");
    expect(html).toContain("href=\"/me\"");
    expect(html).not.toContain("href=\"/audit\"");
    const usersPage = await app.request(
      "/",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      env(users),
    );
    expect(usersPage.status).toBe(302);
    expect(usersPage.headers.get("location")).toBe("/me");
  });

  it("shows /me for an admin", async () => {
    const cookie = await loginCookie(users);
    const res = await app.request(
      "/me",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      env(users),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("toby@toby.codes");
    expect(html).toContain("auth:admin");
    expect(html).toContain("href=\"/\"");
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
    expect(res.headers.get("location")).toBe("/me");
  });

  it("treats /authorize without a client as a local login", async () => {
    const unauth = await app.request("/authorize", {}, env(users));
    expect(unauth.status).toBe(302);
    expect(unauth.headers.get("location")).toBe("/login?next=%2Fme");

    const cookie = await loginCookie(users);
    const authed = await app.request(
      "/authorize",
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(authed.status).toBe(302);
    expect(authed.headers.get("location")).toBe("/me");
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

  it("records permission, password, and delete changes", async () => {
    const audit = new MemoryD1();
    await users.put(
      "guest@toby.codes",
      JSON.stringify({
        email: "guest@toby.codes",
        hashedPassword: await bcrypt.hash("s3cret", 4),
        permissions: ["toby-codes:admin"],
      }),
    );
    const cookie = await loginCookie(users, audit);
    const headers = { Cookie: cookie, Origin: "http://localhost:8788" };
    const e = env(users, audit);
    await app.request(
      "/users/guest@toby.codes/permissions",
      {
        method: "POST",
        body: new URLSearchParams({ permissions: "jvnl:admin" }),
        headers,
      },
      e,
    );
    await app.request(
      "/users/guest@toby.codes/password",
      {
        method: "POST",
        body: new URLSearchParams({ password: "newsecret1" }),
        headers,
      },
      e,
    );
    await app.request(
      "/users/guest@toby.codes/delete",
      { method: "POST", headers },
      e,
    );
    const again = await loginCookie(users, audit);
    const res = await app.request("/audit", { headers: { Cookie: again, Origin: "http://localhost:8788" } }, e);
    const html = await res.text();
    expect(html).toContain("user.permissions");
    expect(html).toContain("toby-codes:admin → jvnl:admin");
    expect(html).toContain("user.password");
    expect(html).toContain("user.delete");
    expect(html).toContain("guest@toby.codes");
    expect(await users.get("guest@toby.codes")).toBeNull();
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

  it("skips passkey index keys when listing users", async () => {
    await users.put("passkey:cred-1", "toby@toby.codes");
    const listed = await listUsers(users as unknown as KVNamespace);
    expect(listed.map((u) => u.email)).toEqual(["toby@toby.codes"]);
  });

  it("shows add-passkey on /me and register controls after one is stored", async () => {
    const cookie = await loginCookie(users);
    const empty = await app.request(
      "/me",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      env(users),
    );
    const emptyHtml = await empty.text();
    expect(emptyHtml).toContain("Add passkey");
    expect(emptyHtml).toContain("No passkey registered");

    const raw = await users.get("toby@toby.codes");
    const user = parseUser(raw);
    await users.put(
      "toby@toby.codes",
      JSON.stringify({
        ...user,
        passkey: { id: "cred-1", publicKey: "AQID", counter: 0 },
      }),
    );
    const full = await app.request(
      "/me",
      { headers: { Cookie: cookie, Origin: "http://localhost:8788" } },
      env(users),
    );
    const html = await full.text();
    expect(html).toContain("A passkey is registered");
    expect(html).toContain("Replace passkey");
    expect(html).toContain("Remove passkey");
  });

  it("rejects passkey registration when not signed in", async () => {
    const res = await app.request(
      "/passkeys/register/options",
      {
        method: "POST",
        headers: { Origin: "http://localhost:8788" },
      },
      env(users),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
  });

  it("registers a passkey and indexes it", async () => {
    const audit = new MemoryD1();
    const session = await loginCookie(users, audit);
    const e = env(users, audit);
    const options = await app.request(
      "/passkeys/register/options",
      {
        method: "POST",
        headers: { Cookie: session, Origin: "http://localhost:8788" },
      },
      e,
    );
    expect(options.status).toBe(200);
    const optJson = (await options.json()) as { options: { challenge: string } };
    expect(optJson.options.challenge).toBeTruthy();
    mockRegisterVerified("cred-1");
    const cookie = mergeCookies(session, cookiesOf(options));
    const reg = await app.request(
      "/passkeys/register",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:8788",
          "content-type": "application/json",
        },
        body: JSON.stringify({ credential: dummyCredential }),
      },
      e,
    );
    expect(reg.status).toBe(200);
    expect(await reg.json()).toEqual({ ok: true });
    expect(await users.get("passkey:cred-1")).toBe("toby@toby.codes");
    const stored = parseUser(await users.get("toby@toby.codes"));
    expect(stored?.passkey?.id).toBe("cred-1");
    expect(stored?.passkey?.publicKey).toBe("AQID");
    expect(audit.events.some((ev) => ev.type === "passkey.register")).toBe(true);
    expect(audit.events.find((ev) => ev.type === "passkey.register")?.detail).toBe(
      "create",
    );
  });

  it("replaces an existing passkey and drops the old index", async () => {
    const session = await loginCookie(users);
    const raw = parseUser(await users.get("toby@toby.codes"));
    await users.put(
      "toby@toby.codes",
      JSON.stringify({
        ...raw,
        passkey: { id: "cred-old", publicKey: "AQID", counter: 0 },
      }),
    );
    await users.put("passkey:cred-old", "toby@toby.codes");
    const options = await app.request(
      "/passkeys/register/options",
      {
        method: "POST",
        headers: { Cookie: session, Origin: "http://localhost:8788" },
      },
      env(users),
    );
    mockRegisterVerified("cred-new");
    const reg = await app.request(
      "/passkeys/register",
      {
        method: "POST",
        headers: {
          Cookie: mergeCookies(session, cookiesOf(options)),
          Origin: "http://localhost:8788",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          credential: { ...dummyCredential, id: "cred-new" },
        }),
      },
      env(users),
    );
    expect(reg.status).toBe(200);
    expect(await users.get("passkey:cred-old")).toBeNull();
    expect(await users.get("passkey:cred-new")).toBe("toby@toby.codes");
    expect(parseUser(await users.get("toby@toby.codes"))?.passkey?.id).toBe(
      "cred-new",
    );
  });

  it("removes a passkey from /me", async () => {
    const audit = new MemoryD1();
    const session = await loginCookie(users, audit);
    const raw = parseUser(await users.get("toby@toby.codes"));
    await users.put(
      "toby@toby.codes",
      JSON.stringify({
        ...raw,
        passkey: { id: "cred-1", publicKey: "AQID", counter: 0 },
      }),
    );
    await users.put("passkey:cred-1", "toby@toby.codes");
    const res = await app.request(
      "/passkeys/delete",
      {
        method: "POST",
        headers: { Cookie: session, Origin: "http://localhost:8788" },
      },
      env(users, audit),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/me");
    expect(parseUser(await users.get("toby@toby.codes"))?.passkey).toBeUndefined();
    expect(await users.get("passkey:cred-1")).toBeNull();
    expect(audit.events.some((ev) => ev.type === "passkey.delete")).toBe(true);
  });

  it("logs in with a passkey and lands on /me", async () => {
    const audit = new MemoryD1();
    const raw = parseUser(await users.get("toby@toby.codes"));
    await users.put(
      "toby@toby.codes",
      JSON.stringify({
        ...raw,
        passkey: { id: "cred-1", publicKey: "AQID", counter: 0 },
      }),
    );
    await users.put("passkey:cred-1", "toby@toby.codes");
    const e = env(users, audit);
    const options = await app.request(
      "/login/passkey/options",
      {
        method: "POST",
        headers: { Origin: "http://localhost:8788" },
      },
      e,
    );
    expect(options.status).toBe(200);
    mockAuthVerified("cred-1", 4);
    const login = await app.request(
      "/login/passkey",
      {
        method: "POST",
        headers: {
          Cookie: cookiesOf(options),
          Origin: "http://localhost:8788",
          "content-type": "application/json",
        },
        body: JSON.stringify({ credential: dummyCredential }),
      },
      e,
    );
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ ok: true, redirect: "/me" });
    expect(cookiesOf(login)).toContain("auth_session=");
    expect(parseUser(await users.get("toby@toby.codes"))?.passkey?.counter).toBe(
      4,
    );
    expect(
      audit.events.find((ev) => ev.type === "login.success" && ev.detail === "passkey")
        ?.email,
    ).toBe("toby@toby.codes");
  });

  it("issues a ticket after passkey login for an app client", async () => {
    const raw = parseUser(await users.get("toby@toby.codes"));
    await users.put(
      "toby@toby.codes",
      JSON.stringify({
        ...raw,
        passkey: { id: "cred-1", publicKey: "AQID", counter: 0 },
      }),
    );
    await users.put("passkey:cred-1", "toby@toby.codes");
    const options = await app.request(
      "https://auth.tobys.cloud/login/passkey/options",
      {
        method: "POST",
        headers: { Origin: "https://auth.tobys.cloud" },
      },
      env(users),
    );
    mockAuthVerified();
    const login = await app.request(
      "https://auth.tobys.cloud/login/passkey",
      {
        method: "POST",
        headers: {
          Cookie: cookiesOf(options),
          Origin: "https://auth.tobys.cloud",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          credential: dummyCredential,
          client: "toby-codes",
          redirect: "https://www.toby.codes/auth/callback",
          next: "/admin",
        }),
      },
      env(users),
    );
    expect(login.status).toBe(200);
    const body = (await login.json()) as { ok: boolean; redirect: string };
    expect(body.ok).toBe(true);
    const loc = new URL(body.redirect);
    expect(loc.origin).toBe("https://www.toby.codes");
    const ticket = loc.searchParams.get("ticket") ?? "";
    const payload = await verifyAuthToken(SECRET, ticket, {
      aud: "toby-codes",
      typ: "ticket",
    });
    expect(payload?.sub).toBe("toby@toby.codes");
  });

  it("records passkey login failure without a credential", async () => {
    const audit = new MemoryD1();
    const options = await app.request(
      "/login/passkey/options",
      {
        method: "POST",
        headers: { Origin: "http://localhost:8788" },
      },
      env(users, audit),
    );
    mockAuthVerified();
    const login = await app.request(
      "/login/passkey",
      {
        method: "POST",
        headers: {
          Cookie: cookiesOf(options),
          Origin: "http://localhost:8788",
          "content-type": "application/json",
        },
        body: JSON.stringify({ credential: dummyCredential }),
      },
      env(users, audit),
    );
    expect(login.status).toBe(401);
    expect(
      audit.events.some(
        (ev) => ev.type === "login.failure" && ev.detail === "passkey",
      ),
    ).toBe(true);
  });

  it("drops the passkey index when deleting a user", async () => {
    await users.put(
      "guest@toby.codes",
      JSON.stringify({
        email: "guest@toby.codes",
        hashedPassword: await bcrypt.hash("s3cret", 4),
        permissions: ["toby-codes:admin"],
        passkey: { id: "cred-g", publicKey: "AQID", counter: 0 },
      }),
    );
    await users.put("passkey:cred-g", "guest@toby.codes");
    const cookie = await loginCookie(users);
    await app.request(
      "/users/guest@toby.codes/delete",
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost:8788" },
      },
      env(users),
    );
    expect(await users.get("guest@toby.codes")).toBeNull();
    expect(await users.get("passkey:cred-g")).toBeNull();
  });
});
