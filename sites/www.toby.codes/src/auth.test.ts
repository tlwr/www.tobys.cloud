import { describe, expect, it } from "vitest";
import { app } from "./index";
import type { Env } from "./env";
import { issuePayload, signAuthToken } from "@tobys/auth-client";

const JWT = "test-jwt-secret-at-least-32-chars!!";

const assets404 = {
  fetch: async () => new Response("not found", { status: 404 }),
} as unknown as Fetcher;

const emptyKv = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
  list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
} as unknown as KVNamespace;

function env(): Env {
  return {
    ASSETS: assets404,
    POSTS: emptyKv,
    TAGS: emptyKv,
    AUTH_JWT_SECRET: JWT,
    AUTH_ISSUER: "https://auth.tobys.cloud",
  };
}

async function sessionCookie(): Promise<string> {
  const jwt = await signAuthToken(
    JWT,
    issuePayload(
      "toby@toby.codes",
      "toby-codes",
      ["toby-codes:admin"],
      "session",
      3600,
    ),
  );
  return `auth_session=${jwt}`;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) {
    headers.set("Origin", "http://localhost");
  }
  return app.request(path, { ...init, headers }, env());
}

describe("auth", () => {
  it("GET /login redirects to the central issuer", async () => {
    const login = await request("/login");
    expect(login.status).toBe(302);
    const loc = login.headers.get("location") ?? "";
    expect(loc).toContain("https://auth.tobys.cloud/authorize");
    expect(loc).toContain("client=toby-codes");

    const home = await request("/");
    expect(await home.text()).not.toContain('href="/login"');
  });

  it("protects /admin then allows a valid session JWT", async () => {
    const unauth = await request("/admin");
    expect(unauth.status).toBe(302);
    expect(unauth.headers.get("location")).toContain("/authorize");

    const cookie = await sessionCookie();
    const admin = await request("/admin", { headers: { Cookie: cookie } });
    expect(admin.status).toBe(200);
    const html = await admin.text();
    expect(html).toContain('href="/admin/posts"');
    expect(html).toContain("Log out");
  });

  it("logout redirects to the issuer", async () => {
    const cookie = await sessionCookie();
    const res = await request("/logout", { headers: { Cookie: cookie } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("https://auth.tobys.cloud/logout");
  });

  it("exchanges a ticket for a session cookie", async () => {
    const ticket = await signAuthToken(
      JWT,
      issuePayload(
        "toby@toby.codes",
        "toby-codes",
        ["toby-codes:admin"],
        "ticket",
        120,
      ),
    );
    const res = await request(
      `/auth/callback?ticket=${encodeURIComponent(ticket)}&next=/admin`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    const raw =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") ?? ""];
    expect(raw.some((c) => c.startsWith("auth_session="))).toBe(true);
  });
});
