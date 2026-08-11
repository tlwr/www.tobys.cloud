import { describe, expect, it, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "./index";
import type { Env } from "./env";

class MemoryKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
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

const assets404 = {
  fetch: async () => new Response("not found", { status: 404 }),
} as unknown as Fetcher;

const emptyPosts = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
  list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
} as unknown as KVNamespace;

function env(users: MemoryKV): Env {
  return {
    ASSETS: assets404,
    USERS: users as unknown as KVNamespace,
    POSTS: emptyPosts,
    SESSION_SECRET: "test-session-secret",
    NODE_ENV: "test",
  };
}

async function request(
  path: string,
  init: RequestInit = {},
  users: MemoryKV,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) {
    headers.set("Origin", "http://localhost");
  }
  return app.request(path, { ...init, headers }, env(users));
}

describe("auth", () => {
  let users: MemoryKV;

  beforeEach(async () => {
    users = new MemoryKV();
    const hashedPassword = await bcrypt.hash("s3cret", 4);
    await users.put(
      "toby",
      JSON.stringify({ username: "toby", hashedPassword }),
    );
  });

  it("GET /login shows form and is not linked from home", async () => {
    const login = await request("/login", {}, users);
    expect(login.status).toBe(200);
    const html = await login.text();
    expect(html).toContain('action="/login"');
    expect(html).toContain('name="username"');
    expect(html).toContain("noindex");

    const home = await request("/", {}, users);
    const homeHtml = await home.text();
    expect(homeHtml).not.toContain('href="/login"');
  });

  it("rejects bad credentials", async () => {
    const body = new URLSearchParams({
      username: "toby",
      password: "wrong",
    });
    const res = await request(
      "/login",
      { method: "POST", body, headers: { Origin: "http://localhost" } },
      users,
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid credentials");
  });

  it("logs in and sets session cookies", async () => {
    const body = new URLSearchParams({
      username: "toby",
      password: "s3cret",
    });
    const res = await request(
      "/login",
      { method: "POST", body, headers: { Origin: "http://localhost" } },
      users,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("username=");
  });

  it("shows Log out in nav after login and GET /logout clears session", async () => {
    const body = new URLSearchParams({
      username: "toby",
      password: "s3cret",
    });
    const loginRes = await request(
      "/login",
      { method: "POST", body, headers: { Origin: "http://localhost" } },
      users,
    );
    const rawCookies =
      typeof loginRes.headers.getSetCookie === "function"
        ? loginRes.headers.getSetCookie()
        : [loginRes.headers.get("set-cookie") ?? ""];
    const cookieHeader = rawCookies
      .filter(Boolean)
      .map((c) => c.split(";")[0])
      .join("; ");

    const home = await request(
      "/",
      { headers: { Cookie: cookieHeader } },
      users,
    );
    const homeHtml = await home.text();
    expect(homeHtml).toContain('href="/logout"');
    expect(homeHtml).toContain("Log out");
    expect(homeHtml).toContain('href="/admin"');
    expect(homeHtml).not.toContain('href="/login"');

    const logout = await request(
      "/logout",
      { headers: { Cookie: cookieHeader } },
      users,
    );
    expect(logout.status).toBe(302);
    expect(logout.headers.get("location")).toBe("/");
  });

  it("protects /admin and /admin/posts", async () => {
    const unauth = await request("/admin", {}, users);
    expect(unauth.status).toBe(302);
    expect(unauth.headers.get("location")).toBe("/login");

    const body = new URLSearchParams({
      username: "toby",
      password: "s3cret",
    });
    const loginRes = await request(
      "/login",
      { method: "POST", body, headers: { Origin: "http://localhost" } },
      users,
    );
    const rawCookies =
      typeof loginRes.headers.getSetCookie === "function"
        ? loginRes.headers.getSetCookie()
        : [loginRes.headers.get("set-cookie") ?? ""];
    const cookieHeader = rawCookies
      .filter(Boolean)
      .map((c) => c.split(";")[0])
      .join("; ");

    const admin = await request(
      "/admin",
      { headers: { Cookie: cookieHeader } },
      users,
    );
    expect(admin.status).toBe(200);
    const adminHtml = await admin.text();
    expect(adminHtml).toContain('href="/admin/posts"');

    const posts = await request(
      "/admin/posts",
      { headers: { Cookie: cookieHeader } },
      users,
    );
    expect(posts.status).toBe(200);
    const postsHtml = await posts.text();
    expect(postsHtml).toContain("Dated");
    expect(postsHtml).toContain("Undated");
    expect(postsHtml).toMatch(/🟢 on|🔴 off/);
  });
});
