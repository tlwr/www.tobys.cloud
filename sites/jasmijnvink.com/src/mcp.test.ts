import { describe, expect, it } from "vitest";
import { app } from "./index";
import type { Env } from "./env";

class MemoryKV {
  private store = new Map<string, string>();
  constructor(entries: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(entries)) {
      this.store.set(key, value);
    }
  }
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

function env(pictures: MemoryKV, tags: MemoryKV): Env {
  return {
    PICTURES: pictures as unknown as KVNamespace,
    TAGS: tags as unknown as KVNamespace,
    IMAGES: { get: async () => null, put: async () => {}, delete: async () => {} } as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } as unknown as Fetcher,
    AUTH_ISSUER: "https://auth.tobys.cloud",
  };
}

describe("mcp", () => {
  it("publishes protected resource metadata", async () => {
    const res = await app.request(
      "https://jasmijnvink.com/.well-known/oauth-protected-resource",
      {},
      env(new MemoryKV(), new MemoryKV()),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(body.resource).toBe("https://jasmijnvink.com/mcp");
    expect(body.authorization_servers).toEqual(["https://auth.tobys.cloud"]);
  });

  it("asks for a token when /mcp is called anonymously", async () => {
    const res = await app.request(
      "https://jasmijnvink.com/mcp",
      {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        headers: { "content-type": "application/json" },
      },
      env(new MemoryKV(), new MemoryKV()),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      "oauth-protected-resource",
    );
  });
});
