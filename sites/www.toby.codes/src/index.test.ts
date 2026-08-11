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

const emptyPosts = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
  list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
} as unknown as KVNamespace;

function env(): Env {
  return {
    ASSETS: assets404,
    USERS: emptyUsers,
    POSTS: emptyPosts,
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

  it("serves raw markdown without layout or frontmatter for .md suffix", async () => {
    const posts = {
      get: async (key: string) => {
        if (key === "With-Meta") {
          return "---\nvisible: true\n---\n# Title\n\nBody only.\n";
        }
        return null;
      },
      put: async () => {},
      delete: async () => {},
      list: async () => ({
        keys: [{ name: "With-Meta" }],
        list_complete: true,
        cacheStatus: null,
      }),
    } as unknown as KVNamespace;

    const res = await app.request(
      "/posts/With-Meta.md",
      {},
      { ...env(), POSTS: posts },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toContain("# Title");
    expect(body).toContain("Body only.");
    expect(body).not.toContain("visible:");
    expect(body).not.toContain("---");
    expect(body).not.toContain("<nav>");
    expect(body).not.toContain("Toby Lorne");
  });

  it("404s hidden posts for anonymous users", async () => {
    const posts = {
      get: async () => "---\nvisible: false\n---\n# Draft\n",
      put: async () => {},
      delete: async () => {},
      list: async () => ({
        keys: [{ name: "Draft" }],
        list_complete: true,
        cacheStatus: null,
      }),
    } as unknown as KVNamespace;

    const html = await app.request(
      "/posts/Draft",
      {},
      { ...env(), POSTS: posts },
    );
    expect(html.status).toBe(404);

    const md = await app.request(
      "/posts/Draft.md",
      {},
      { ...env(), POSTS: posts },
    );
    expect(md.status).toBe(404);
  });

  it("returns plain 404 for missing .md", async () => {
    const res = await app.request("/posts/no-such-post.md", {}, env());
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("404");
  });
});
