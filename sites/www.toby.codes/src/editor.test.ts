import { describe, expect, it, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "./index";
import type { Env } from "./env";

class MemoryKV {
  private store = new Map<string, string>();

  constructor(entries: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(entries)) {
      this.store.set(k, v);
    }
  }

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

function env(users: MemoryKV, posts: MemoryKV): Env {
  return {
    ASSETS: assets404,
    USERS: users as unknown as KVNamespace,
    POSTS: posts as unknown as KVNamespace,
    SESSION_SECRET: "test-session-secret",
  };
}

async function loginCookie(users: MemoryKV, posts: MemoryKV): Promise<string> {
  const body = new URLSearchParams({
    username: "toby",
    password: "s3cret",
  });
  const loginRes = await app.request(
    "/login",
    {
      method: "POST",
      body,
      headers: { Origin: "http://localhost" },
    },
    env(users, posts),
  );
  const rawCookies =
    typeof loginRes.headers.getSetCookie === "function"
      ? loginRes.headers.getSetCookie()
      : [loginRes.headers.get("set-cookie") ?? ""];
  return rawCookies
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("post editor", () => {
  let users: MemoryKV;
  let posts: MemoryKV;

  beforeEach(async () => {
    users = new MemoryKV();
    const hashedPassword = await bcrypt.hash("s3cret", 4);
    await users.put(
      "toby",
      JSON.stringify({ username: "toby", hashedPassword }),
    );
    posts = new MemoryKV({
      Sample: "---\nvisible: true\n---\n# Hello\n\nWorld.\n",
    });
  });

  it("loads editor with raw markdown including frontmatter", async () => {
    const cookie = await loginCookie(users, posts);
    const res = await app.request(
      "/admin/posts/Sample/edit",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      env(users, posts),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("htmx.min.js");
    expect(html).toContain('id="markdown"');
    expect(html).toContain("visible: true");
    expect(html).toContain("# Hello");
    expect(html).toContain('hx-post="/admin/posts/preview"');
  });

  it("preview strips frontmatter and returns HTML", async () => {
    const cookie = await loginCookie(users, posts);
    const body = new URLSearchParams({
      markdown: "---\nvisible: false\n---\n# Title\n\nPara.",
    });
    const res = await app.request(
      "/admin/posts/preview",
      {
        method: "POST",
        body,
        headers: {
          Cookie: cookie,
          Origin: "http://localhost",
        },
      },
      env(users, posts),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("Para.");
    expect(html).not.toContain("visible");
    expect(html).not.toContain("---");
  });

  it("saves full raw markdown to KV", async () => {
    const cookie = await loginCookie(users, posts);
    const next = "---\nvisible: false\n---\n# Updated\n";
    const body = new URLSearchParams({ markdown: next });
    const res = await app.request(
      "/admin/posts/Sample",
      {
        method: "POST",
        body,
        headers: {
          Cookie: cookie,
          Origin: "http://localhost",
        },
      },
      env(users, posts),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Saved");
    expect(await posts.get("Sample")).toBe(next);
  });

  it("redirects unauthenticated editor to login", async () => {
    const res = await app.request(
      "/admin/posts/Sample/edit",
      {},
      env(users, posts),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });
});
