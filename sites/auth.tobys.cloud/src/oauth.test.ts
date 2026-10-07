import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "./index";
import type { Env } from "./env";
import { verifyOidcJwt } from "./oauth";

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
  events: { type: string; email: string; detail: string | null }[] = [];
  async batch() {
    return [];
  }
  prepare(sql: string) {
    const events = this.events;
    return {
      async run() {
        return { success: true };
      },
      bind(...args: unknown[]) {
        return {
          async run() {
            if (sql.includes("INSERT")) {
              events.push({
                type: String(args[2]),
                email: String(args[3]),
                detail: args[7] == null ? null : String(args[7]),
              });
            }
            return { success: true };
          },
          async all() {
            return { results: [] };
          },
        };
      },
    };
  }
}

const SECRET = "test-jwt-secret-at-least-32-chars";

function env(users: MemoryKV, audit = new MemoryD1()) {
  return {
    USERS: users as unknown as KVNamespace,
    AUDIT: audit as unknown as D1Database,
    AUTH_JWT_SECRET: SECRET,
  } as Env & { AUTH_JWT_SECRET: string };
}

async function adminCookie(users: MemoryKV): Promise<string> {
  await users.put(
    "toby@toby.codes",
    JSON.stringify({
      email: "toby@toby.codes",
      hashedPassword: await bcrypt.hash("s3cret", 4),
      permissions: ["auth:admin"],
    }),
  );
  const res = await app.request(
    "/login",
    {
      method: "POST",
      body: new URLSearchParams({
        email: "toby@toby.codes",
        password: "s3cret",
      }),
      headers: { Origin: "http://localhost" },
    },
    env(users),
  );
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  let s = "";
  for (const b of new Uint8Array(digest)) {
    s += String.fromCharCode(b);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

async function redirectTarget(res: Response): Promise<URL> {
  const html = await res.text();
  const href = html.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? "";
  return new URL(href);
}

describe("oidc", () => {
  it("publishes discovery and a signing key", async () => {
    const users = new MemoryKV();
    const discovery = await app.request(
      "/.well-known/openid-configuration",
      {},
      env(users),
    );
    expect(discovery.status).toBe(200);
    const doc = (await discovery.json()) as { issuer: string; jwks_uri: string };
    expect(doc.issuer).toBe("https://auth.tobys.cloud");
    expect(doc.jwks_uri).toBe("https://auth.tobys.cloud/oauth/jwks");
    const jwks = await app.request("/oauth/jwks", {}, env(users));
    const body = (await jwks.json()) as { keys: { kty: string; alg: string }[] };
    expect(body.keys[0]?.kty).toBe("RSA");
    expect(body.keys[0]?.alg).toBe("RS256");
  });

  it("issues an authorization code and id token", async () => {
    const users = new MemoryKV();
    const audit = new MemoryD1();
    const cookie = await adminCookie(users);
    const e = env(users, audit);
    const created = await app.request(
      "/oauth/apps",
      {
        method: "POST",
        body: new URLSearchParams({
          name: "Outline",
          redirect_uris: "https://notes.example/callback",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      e,
    );
    expect(created.status).toBe(200);
    const html = await created.text();
    const clientId = html.match(/Client ID<\/strong> <code>(oc_[^<]+)/)?.[1] ?? "";
    const secret = html.match(/Client secret<\/strong> <code>([^<]+)/)?.[1] ?? "";
    expect(clientId).toMatch(/^oc_/);
    expect(secret.length).toBeGreaterThan(20);

    const codeChallenge = await s256(VERIFIER);
    const authorize = await app.request(
      `/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent("https://notes.example/callback")}&scope=openid&state=xyz&nonce=n1&code_challenge=${codeChallenge}&code_challenge_method=S256`,
      { headers: { Cookie: cookie } },
      e,
    );
    expect(authorize.status).toBe(200);
    expect(await authorize.text()).toContain("Authorize Outline");

    const consent = await app.request(
      "/oauth/authorize",
      {
        method: "POST",
        body: new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: "https://notes.example/callback",
          scope: "openid",
          state: "xyz",
          nonce: "n1",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      e,
    );
    expect(consent.status).toBe(200);
    const back = await redirectTarget(consent);
    expect(back.origin).toBe("https://notes.example");
    expect(back.searchParams.get("state")).toBe("xyz");
    const code = back.searchParams.get("code") ?? "";

    const token = await app.request(
      "/oauth/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://notes.example/callback",
          client_id: clientId,
          client_secret: secret,
          code_verifier: VERIFIER,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
      e,
    );
    expect(token.status).toBe(200);
    const tokens = (await token.json()) as {
      access_token: string;
      id_token: string;
      token_type: string;
    };
    expect(tokens.token_type).toBe("Bearer");
    const jwks = (await (await app.request("/oauth/jwks", {}, e)).json()) as {
      keys: JsonWebKey[];
    };
    const claims = await verifyOidcJwt(tokens.id_token, jwks.keys[0]);
    expect(claims?.sub).toBe("toby@toby.codes");
    expect(claims?.aud).toBe(clientId);
    expect(claims?.nonce).toBe("n1");
    expect(claims?.iss).toBe("https://auth.tobys.cloud");
    expect(claims?.email_verified).toBe(false);
    expect(claims?.perms).toBeUndefined();

    const userinfo = await app.request(
      "/oauth/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      e,
    );
    expect(userinfo.status).toBe(200);
    expect(((await userinfo.json()) as { email: string }).email).toBe(
      "toby@toby.codes",
    );

    const replay = await app.request(
      "/oauth/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://notes.example/callback",
          client_id: clientId,
          client_secret: secret,
          code_verifier: VERIFIER,
        }),
      },
      e,
    );
    expect(replay.status).toBe(400);
    expect(audit.events.some((event) => event.type === "oauth.token")).toBe(true);
  });

  it("rejects a redirect URI that was not registered", async () => {
    const users = new MemoryKV();
    const cookie = await adminCookie(users);
    const created = await app.request(
      "/oauth/apps",
      {
        method: "POST",
        body: new URLSearchParams({
          name: "Nope",
          redirect_uris: "https://ok.example/callback",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      env(users),
    );
    const clientId =
      (await created.text()).match(/Client ID<\/strong> <code>(oc_[^<]+)/)?.[1] ?? "";
    const res = await app.request(
      `/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent("https://evil.example/callback")}&scope=openid`,
      { headers: { Cookie: cookie } },
      env(users),
    );
    expect(res.status).toBe(400);
  });

  it("accepts ChatGPT's public client for the jasmijnvink MCP resource", async () => {
    const users = new MemoryKV();
    await users.put(
      "jasmijn@example.com",
      JSON.stringify({
        email: "jasmijn@example.com",
        hashedPassword: await bcrypt.hash("s3cret", 4),
        permissions: ["jvnl:admin"],
      }),
    );
    const login = await app.request(
      "/login",
      {
        method: "POST",
        body: new URLSearchParams({
          email: "jasmijn@example.com",
          password: "s3cret",
        }),
        headers: { Origin: "http://localhost" },
      },
      env(users),
    );
    const cookie = (
      typeof login.headers.getSetCookie === "function"
        ? login.headers.getSetCookie()
        : [login.headers.get("set-cookie") ?? ""]
    )
      .map((part) => part.split(";")[0])
      .join("; ");
    const clientId = "https://chatgpt.com/oauth/client.json";
    const redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      if (String(input) === clientId) {
        return new Response(
          JSON.stringify({
            client_id: clientId,
            client_name: "ChatGPT",
            redirect_uris: [redirect],
            token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
          }),
          { status: 200 },
        );
      }
      return realFetch(input);
    };
    try {
      const challenge = await s256(VERIFIER);
      const consent = await app.request(
        "/oauth/authorize",
        {
          method: "POST",
          body: new URLSearchParams({
            response_type: "code",
            client_id: clientId,
            redirect_uri: redirect,
            scope: "openid email jvnl",
            state: "st",
            code_challenge: challenge,
            code_challenge_method: "S256",
            resource: "https://jasmijnvink.com/mcp",
          }),
          headers: { Origin: "http://localhost", Cookie: cookie },
        },
        env(users),
      );
      expect(consent.status).toBe(200);
      const back = await redirectTarget(consent);
      expect(back.searchParams.get("iss")).toBe("https://auth.tobys.cloud");
      const code = back.searchParams.get("code") ?? "";
      const token = await app.request(
        "/oauth/token",
        {
          method: "POST",
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirect,
            client_id: clientId,
            code_verifier: VERIFIER,
            resource: "https://jasmijnvink.com/mcp",
          }),
        },
        env(users),
      );
      expect(token.status).toBe(200);
      const body = (await token.json()) as { access_token: string; scope: string };
      expect(body.scope).toContain("jvnl");
      const jwks = (await (await app.request("/oauth/jwks", {}, env(users))).json()) as {
        keys: JsonWebKey[];
      };
      const access = await verifyOidcJwt(body.access_token, jwks.keys[0]);
      expect(access?.aud).toBe("https://jasmijnvink.com/mcp");
      expect(access?.perms).toBeUndefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("lets a PKCE-only app exchange a code without a client secret", async () => {
    const users = new MemoryKV();
    const cookie = await adminCookie(users);
    const created = await app.request(
      "/oauth/apps",
      {
        method: "POST",
        body: new URLSearchParams({
          name: "Grok",
          client_id: "oc_jasmijnvink",
          redirect_uris: "https://grok.com/connectors-oauth-exchange-code/",
          public: "1",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      env(users),
    );
    const html = await created.text();
    expect(html).toContain("PKCE only");
    expect(html).not.toContain("<strong>Client secret</strong>");
    const clientId = html.match(/Client ID<\/strong> <code>(oc_[^<]+)/)?.[1] ?? "";
    expect(clientId).toBe("oc_jasmijnvink");
    const account = JSON.parse((await users.get("toby@toby.codes")) ?? "{}") as {
      permissions: string[];
    };
    account.permissions = ["auth:admin", "jvnl:admin"];
    await users.put("toby@toby.codes", JSON.stringify(account));
    const challenge = await s256(VERIFIER);
    const consent = await app.request(
      "/oauth/authorize",
      {
        method: "POST",
        body: new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
          scope: "openid email jvnl",
          code_challenge: challenge,
          code_challenge_method: "S256",
          resource: "https://jasmijnvink.com/mcp",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      env(users),
    );
    expect(consent.status).toBe(200);
    const code = (await redirectTarget(consent)).searchParams.get("code") ?? "";
    const token = await app.request(
      "/oauth/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
          client_id: clientId,
          code_verifier: VERIFIER,
          resource: "https://jasmijnvink.com/mcp",
        }),
      },
      env(users),
    );
    expect(token.status).toBe(200);
  });

  it("mints an erg MCP token only for a user with erg:read", async () => {
    const users = new MemoryKV();
    const cookie = await adminCookie(users);
    const created = await app.request(
      "/oauth/apps",
      {
        method: "POST",
        body: new URLSearchParams({
          name: "Grok erg",
          client_id: "oc_erg",
          redirect_uris: "https://grok.com/connectors-oauth-exchange-code/",
          public: "1",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      env(users),
    );
    expect(created.status).toBe(200);
    const challenge = await s256(VERIFIER);
    const denied = await app.request(
      "/oauth/authorize",
      {
        method: "POST",
        body: new URLSearchParams({
          response_type: "code",
          client_id: "oc_erg",
          redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
          scope: "openid email erg",
          code_challenge: challenge,
          code_challenge_method: "S256",
          resource: "https://erg.tobys.cloud/mcp",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      env(users),
    );
    expect((await redirectTarget(denied)).searchParams.get("error")).toBe(
      "access_denied",
    );
    const account = JSON.parse((await users.get("toby@toby.codes")) ?? "{}") as {
      permissions: string[];
    };
    account.permissions = ["auth:admin", "erg:read"];
    await users.put("toby@toby.codes", JSON.stringify(account));
    const consent = await app.request(
      "/oauth/authorize",
      {
        method: "POST",
        body: new URLSearchParams({
          response_type: "code",
          client_id: "oc_erg",
          redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
          scope: "openid email erg",
          code_challenge: challenge,
          code_challenge_method: "S256",
          resource: "https://erg.tobys.cloud/mcp",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      env(users),
    );
    const code = (await redirectTarget(consent)).searchParams.get("code") ?? "";
    const token = await app.request(
      "/oauth/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
          client_id: "oc_erg",
          code_verifier: VERIFIER,
          resource: "https://erg.tobys.cloud/mcp",
        }),
      },
      env(users),
    );
    expect(token.status).toBe(200);
    const body = (await token.json()) as { access_token: string; scope: string };
    expect(body.scope).toBe("openid email erg");
    const jwks = (await (await app.request("/oauth/jwks", {}, env(users))).json()) as {
      keys: JsonWebKey[];
    };
    const access = await verifyOidcJwt(body.access_token, jwks.keys[0]);
    expect(access?.aud).toBe("https://erg.tobys.cloud/mcp");
    expect(access?.scope).toBe("openid email erg");
  });

  it("registers a PKCE-only client for an allowed assistant redirect", async () => {
    const users = new MemoryKV();
    const cookie = await adminCookie(users);
    const e = env(users);
    const registered = await app.request(
      "/oauth/register",
      {
        method: "POST",
        body: JSON.stringify({
          client_name: "Grok",
          redirect_uris: ["https://grok.com/connectors-oauth-exchange-code/"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
        }),
        headers: { "content-type": "application/json" },
      },
      e,
    );
    expect(registered.status).toBe(201);
    const reg = (await registered.json()) as { client_id: string };
    expect(reg.client_id).toMatch(/^oc_/);

    const rejected = await app.request(
      "/oauth/register",
      {
        method: "POST",
        body: JSON.stringify({
          redirect_uris: ["https://evil.example/callback"],
        }),
        headers: { "content-type": "application/json" },
      },
      e,
    );
    expect(rejected.status).toBe(400);

    const challenge = await s256(VERIFIER);
    const consent = await app.request(
      "/oauth/authorize",
      {
        method: "POST",
        body: new URLSearchParams({
          response_type: "code",
          client_id: reg.client_id,
          redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
          scope: "openid",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
        headers: { Origin: "http://localhost", Cookie: cookie },
      },
      e,
    );
    expect(consent.status).toBe(200);
    const code = (await redirectTarget(consent)).searchParams.get("code") ?? "";
    const token = await app.request(
      "/oauth/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
          client_id: reg.client_id,
          code_verifier: VERIFIER,
        }),
      },
      e,
    );
    expect(token.status).toBe(200);
  });

  it("refuses OIDC on a host that is not the issuer", async () => {
    const users = new MemoryKV();
    const res = await app.request(
      "https://auth-tobys-cloud.example.workers.dev/.well-known/openid-configuration",
      {},
      env(users),
    );
    expect(res.status).toBe(400);
  });
});
