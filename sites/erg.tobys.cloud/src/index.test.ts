import { describe, expect, it, vi, afterEach } from "vitest";
import { paceText } from "./concept2";
import worker from "./index";
import type { Env } from "./mcp";

const ISSUER = "https://auth.tobys.cloud";

function env(token = "logbook-token"): Env {
  return { CONCEPT2_ACCESS_TOKEN: token, AUTH_ISSUER: ISSUER };
}

async function signToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data));
  let raw = "";
  for (const byte of sig) {
    raw += String.fromCharCode(byte);
  }
  const signature = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${header}.${payload}.${signature}`;
}

async function caller(): Promise<{ token: string; publicJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  publicJwk.alg = "RS256";
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken(pair.privateKey, {
    iss: ISSUER,
    aud: "https://erg.tobys.cloud/mcp",
    email: "toby@toby.codes",
    scope: "openid email erg",
    exp: now + 3600,
  });
  return { token, publicJwk };
}

function workout(id: number) {
  return {
    id,
    date: "2026-10-01 07:12:00",
    distance: 2000,
    type: "rower",
    time: 4800,
    time_formatted: "8:00.0",
    workout_type: "FixedDistanceSplits",
    stroke_rate: 24,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("erg mcp", () => {
  it("publishes protected resource metadata", async () => {
    const res = await worker.fetch(
      new Request("https://erg.tobys.cloud/.well-known/oauth-protected-resource/mcp"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      resource: string;
      authorization_servers: string[];
      scopes_supported: string[];
    };
    expect(body.resource).toBe("https://erg.tobys.cloud/mcp");
    expect(body.authorization_servers).toEqual(["https://auth.tobys.cloud"]);
    expect(body.scopes_supported).toContain("erg");
  });

  it("asks for a token when /mcp is called anonymously", async () => {
    const res = await worker.fetch(
      new Request("https://erg.tobys.cloud/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("scope=\"erg\"");
  });

  it("lists read-only tools for a valid token", async () => {
    const { token, publicJwk } = await caller();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(`${ISSUER}/oauth/jwks`);
        return Response.json({ keys: [publicJwk] });
      }),
    );
    const res = await worker.fetch(
      new Request("https://erg.tobys.cloud/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] };
    };
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      "logbook_profile",
      "list_results",
      "get_result",
    ]);
    expect(body.result.tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
  });

  it("lists workouts and computes 500m pace", async () => {
    const { token, publicJwk } = await caller();
    const calls: { url: string; method: string; authorization: string | null; accept: string | null }[] =
      [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        calls.push({
          url,
          method: init?.method ?? "GET",
          authorization: headers.get("authorization"),
          accept: headers.get("accept"),
        });
        if (url.endsWith("/oauth/jwks")) {
          return Response.json({ keys: [publicJwk] });
        }
        return Response.json({
          data: [workout(3), { ...workout(8), type: "bike", distance: 10000, time: 12000 }],
          meta: { pagination: { total: 2, total_pages: 1, current_page: 1 } },
        });
      }),
    );
    const res = await worker.fetch(
      new Request("https://erg.tobys.cloud/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "list_results",
            arguments: { from: "2026-10-01", to: "2026-10-07", type: "rower", page: 1 },
          },
        }),
      }),
      env("personal-token"),
    );
    const body = (await res.json()) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    expect(body.result.isError).toBeUndefined();
    expect(body.result.content[0].text).toContain("#3 2026-10-01 rower 2000m 8:00.0 2:00.0/500m");
    expect(body.result.content[0].text).toContain("2:00.0/1000m");
    const logbook = calls.find((call) => call.url.includes("log.concept2.com"));
    expect(logbook?.method).toBe("GET");
    expect(logbook?.authorization).toBe("Bearer personal-token");
    expect(logbook?.accept).toBe("application/vnd.c2logbook.v1+json");
    expect(logbook?.url).toContain("from=2026-10-01");
    expect(logbook?.url).toContain("type=rower");
    expect(calls.some((call) => call.method !== "GET")).toBe(false);
  });

  it("rejects a bad date without calling Concept2", async () => {
    const { token, publicJwk } = await caller();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${ISSUER}/oauth/jwks`);
      return Response.json({ keys: [publicJwk] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await worker.fetch(
      new Request("https://erg.tobys.cloud/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list_results", arguments: { from: "yesterday" } },
        }),
      }),
      env(),
    );
    const body = (await res.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("YYYY-MM-DD");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads one workout with splits", async () => {
    const { token, publicJwk } = await caller();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/oauth/jwks")) {
          return Response.json({ keys: [publicJwk] });
        }
        expect(url).toBe("https://log.concept2.com/api/users/me/results/3?include=metadata");
        return Response.json({
          data: {
            ...workout(3),
            workout: {
              splits: [
                { distance: 500, time: 1200, stroke_rate: 26 },
                { distance: 500, time: 1180, stroke_rate: 27 },
              ],
            },
            metadata: { pm_version: 5 },
            email: "hidden@example.com",
          },
        });
      }),
    );
    const res = await worker.fetch(
      new Request("https://erg.tobys.cloud/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "get_result", arguments: { id: "3" } },
        }),
      }),
      env(),
    );
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    expect(body.result.content[0].text).toContain("2:00.0/500m");
    expect(body.result.content[0].text).toContain("1:58.0");
    expect(body.result.content[0].text).not.toContain("hidden@example.com");
  });

  it("omits the profile email", async () => {
    const { token, publicJwk } = await caller();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/oauth/jwks")) {
          return Response.json({ keys: [publicJwk] });
        }
        return Response.json({
          data: {
            id: 1,
            username: "toby",
            first_name: "Toby",
            last_name: "Lorne",
            country: "GBR",
            email: "hidden@example.com",
            dob: "1990-01-01",
          },
        });
      }),
    );
    const res = await worker.fetch(
      new Request("https://erg.tobys.cloud/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "logbook_profile", arguments: {} },
        }),
      }),
      env(),
    );
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    expect(body.result.content[0].text).toContain("Toby Lorne (GBR)");
    expect(body.result.content[0].text).not.toContain("hidden@example.com");
    expect(body.result.content[0].text).not.toContain("1990-01-01");
  });
});

describe("pace", () => {
  it("turns an 8:00 2k into a 2:00.0 split", () => {
    expect(paceText("rower", 4800, 2000)).toBe("2:00.0/500m");
  });
});
