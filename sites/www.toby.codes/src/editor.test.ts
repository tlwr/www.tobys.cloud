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

function env(users: MemoryKV, posts: MemoryKV, tags?: MemoryKV): Env {
  return {
    ASSETS: assets404,
    USERS: users as unknown as KVNamespace,
    POSTS: posts as unknown as KVNamespace,
    TAGS: (tags ?? new MemoryKV()) as unknown as KVNamespace,
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

  it("posts list links to new post", async () => {
    const cookie = await loginCookie(users, posts);
    const res = await app.request(
      "/admin/posts",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      env(users, posts),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/admin/posts/new"');
    expect(html).toContain("New post");
  });

  it("new post form has slug pattern and draft frontmatter", async () => {
    const cookie = await loginCookie(users, posts);
    const res = await app.request(
      "/admin/posts/new",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      env(users, posts),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("htmx.min.js");
    expect(html).toContain('id="slug"');
    expect(html).toContain('pattern="[-_A-Za-z0-9]+"');
    expect(html).toContain("visible: false");
    expect(html).toContain('hx-post="/admin/posts"');
    expect(html).toContain('id="markdown"');
  });

  it("creates a new post and redirects to editor", async () => {
    const cookie = await loginCookie(users, posts);
    const markdown = "---\nvisible: false\n---\n\n# Draft\n";
    const body = new URLSearchParams({
      slug: "2026-08-My-draft",
      markdown,
    });
    const res = await app.request(
      "/admin/posts",
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
    expect(await res.text()).toContain("Created");
    expect(res.headers.get("HX-Redirect")).toBe(
      "/admin/posts/2026-08-My-draft/edit",
    );
    expect(await posts.get("2026-08-My-draft")).toBe(markdown);
  });

  it("rejects invalid slug on create", async () => {
    const cookie = await loginCookie(users, posts);
    const body = new URLSearchParams({
      slug: "bad slug!",
      markdown: "---\nvisible: false\n---\n",
    });
    const res = await app.request(
      "/admin/posts",
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
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid slug");
  });

  it("rejects duplicate slug on create", async () => {
    const cookie = await loginCookie(users, posts);
    const body = new URLSearchParams({
      slug: "Sample",
      markdown: "---\nvisible: false\n---\n",
    });
    const res = await app.request(
      "/admin/posts",
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
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("already exists");
  });

  it("shows delete only for non-visible posts on list and editor", async () => {
    await posts.put("Draft", "---\nvisible: false\n---\n# Draft\n");
    const cookie = await loginCookie(users, posts);

    const listRes = await app.request(
      "/admin/posts",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      env(users, posts),
    );
    const listHtml = await listRes.text();
    expect(listHtml).toContain('action="/admin/posts/Draft/delete"');
    expect(listHtml).not.toContain('action="/admin/posts/Sample/delete"');

    const draftEdit = await app.request(
      "/admin/posts/Draft/edit",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      env(users, posts),
    );
    expect(await draftEdit.text()).toContain(
      'action="/admin/posts/Draft/delete"',
    );

    const publicEdit = await app.request(
      "/admin/posts/Sample/edit",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      env(users, posts),
    );
    expect(await publicEdit.text()).not.toContain(
      'action="/admin/posts/Sample/delete"',
    );
  });

  it("deletes a draft and rejects deleting a visible post", async () => {
    await posts.put("Draft", "---\nvisible: false\n---\n# Draft\n");
    const cookie = await loginCookie(users, posts);

    const deny = await app.request(
      "/admin/posts/Sample/delete",
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      env(users, posts),
    );
    expect(deny.status).toBe(403);
    expect(await posts.get("Sample")).not.toBeNull();

    const ok = await app.request(
      "/admin/posts/Draft/delete",
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      env(users, posts),
    );
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/admin/posts");
    expect(await posts.get("Draft")).toBeNull();
  });

  it("indexes tags on save and exposes public + admin tag UIs", async () => {
    const tags = new MemoryKV();
    const cookie = await loginCookie(users, posts);
    const markdown =
      "---\nvisible: true\ntags: workers, cloudflare\n---\n# Hello\n\nWorld.\n";
    const save = await app.request(
      "/admin/posts/Sample",
      {
        method: "POST",
        body: new URLSearchParams({ markdown }),
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      env(users, posts, tags),
    );
    expect(save.status).toBe(200);
    expect(JSON.parse((await tags.get("workers"))!)).toEqual(["Sample"]);
    expect(JSON.parse((await tags.get("cloudflare"))!)).toEqual(["Sample"]);

    const list = await app.request(
      "/posts",
      {},
      env(users, posts, tags),
    );
    const listHtml = await list.text();
    expect(listHtml).toContain('href="/posts-by-tag/cloudflare"');
    expect(listHtml).toContain('href="/posts-by-tag/workers"');

    const postPage = await app.request(
      "/posts/Sample",
      {},
      env(users, posts, tags),
    );
    const postHtml = await postPage.text();
    expect(postHtml).toContain("Read as markdown");
    expect(postHtml).toContain('href="/posts-by-tag/workers"');

    const byTag = await app.request(
      "/posts-by-tag/workers",
      {},
      env(users, posts, tags),
    );
    expect(byTag.status).toBe(200);
    expect(await byTag.text()).toContain("Sample");

    const adminTags = await app.request(
      "/admin/tags",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      env(users, posts, tags),
    );
    const adminHtml = await adminTags.text();
    expect(adminHtml).toContain("workers");
    expect(adminHtml).toContain('action="/admin/tags/workers/delete"');

    const del = await app.request(
      "/admin/tags/workers/delete",
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      env(users, posts, tags),
    );
    expect(del.status).toBe(302);
    expect(await tags.get("workers")).toBeNull();
    expect(await posts.get("Sample")).toContain("cloudflare");
    expect(await posts.get("Sample")).not.toContain("workers");
  });
});
