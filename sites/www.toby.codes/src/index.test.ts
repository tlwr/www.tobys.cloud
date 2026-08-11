import { describe, expect, it } from "vitest";
import { app } from "./index";
import type { Env } from "./env";

const assets404 = {
  fetch: async () => new Response("not found", { status: 404 }),
} as unknown as Fetcher;

const emptyUsers = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
  list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
} as unknown as KVNamespace;

function env(): Env {
  return {
    ASSETS: assets404,
    USERS: emptyUsers,
    SESSION_SECRET: "test-session-secret",
  };
}

describe("post routes", () => {
  it("serves HTML post with link to .md above content", async () => {
    const res = await app.request(
      "/posts/2020-02-FOSDEM-2020",
      {},
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('href="/posts/2020-02-FOSDEM-2020.md"');
    expect(html).toContain("Read as markdown");
    expect(html).toContain("Eurostar");
    // Layout nav present on HTML version
    expect(html).toContain("Toby Lorne");
    expect(html).toContain('href="/posts"');
  });

  it("serves raw markdown without layout for .md suffix", async () => {
    const res = await app.request(
      "/posts/2020-02-FOSDEM-2020.md",
      {},
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toContain("Eurostar");
    expect(body).not.toContain("<nav>");
    expect(body).not.toContain("Toby Lorne");
  });

  it("returns plain 404 for missing .md", async () => {
    const res = await app.request("/posts/no-such-post.md", {}, env());
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("404");
  });
});
