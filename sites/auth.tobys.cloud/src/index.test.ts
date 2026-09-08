import { describe, expect, it, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "./index";
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

const SECRET = "test-jwt-secret-at-least-32-chars";

function env(users: MemoryKV): Env & { AUTH_JWT_SECRET: string } {
  return {
    USERS: users as unknown as KVNamespace,
    AUTH_JWT_SECRET: SECRET,
  };
}

async function loginCookie(users: MemoryKV): Promise<string> {
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
    env(users),
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
      `/authorize?client=toby-codes&redirect=${encodeURIComponent(redirect)}&next=/admin`,
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
      `/authorize?client=toby-codes&redirect=${encodeURIComponent("https://www.toby.codes/auth/callback")}`,
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(res.status).toBe(403);
  });

  it("rejects redirect to an unknown origin", async () => {
    const cookie = await loginCookie(users);
    const res = await app.request(
      `/authorize?client=toby-codes&redirect=${encodeURIComponent("https://evil.example/auth/callback")}`,
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
});
