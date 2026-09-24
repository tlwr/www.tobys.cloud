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
    expect(consent.status).toBe(302);
    const back = new URL(consent.headers.get("location") ?? "");
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
