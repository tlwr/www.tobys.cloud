import { WorkerEntrypoint } from "cloudflare:workers";
import { originAllowed } from "@tobys/auth-client";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { marked } from "marked";
import {
  getIsLoggedIn,
  handleAuthCallback,
  loginRedirect,
  logoutAndRedirect,
  requireAuth,
} from "./auth";
import {
  isPublicCacheablePath,
  PRIVATE_NO_STORE,
  purgePublic,
  setPublicCache,
  type GatewayExecutionCtx,
} from "./cache";
import type { Env } from "./env";
import { isValidTag, parsePost } from "./frontmatter";
import {
  INDEX_HTML,
  WORK_HTML,
  adminIndexHtml,
  adminPostEditHtml,
  adminPostNewHtml,
  adminPostsHtml,
  adminTagsHtml,
  layout,
  postHtml,
  postsByTagHtml,
  postsListHtml,
  sessionNavHtml,
} from "./html";
import {
  deletePost,
  getPost,
  isValidSlug,
  listPosts,
  NEW_POST_TEMPLATE,
  putPost,
} from "./posts";
import {
  deleteTag,
  listPostsByTag,
  listTagNames,
  listTags,
  syncPostTags,
  unindexPost,
} from "./tags";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// Localhost CSRF origins are accepted only when this Worker is loopback.
app.use(
  "*",
  csrf({
    origin: (origin, c) =>
      originAllowed("toby-codes", origin, new URL(c.req.url).origin),
  }),
);

app.get("/health", (c) => c.text("healthy"));

app.get("/session-nav", async (c) => {
  c.header("Cache-Control", PRIVATE_NO_STORE);
  const isLoggedIn = await getIsLoggedIn(c);
  return c.html(isLoggedIn ? sessionNavHtml() : "");
});

app.get("/robots.txt", (c) => {
  setPublicCache(c, ["robots"]);
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body("User-agent: *\nAllow: /\n");
});

app.get("/", (c) => {
  setPublicCache(c, ["home"]);
  return c.html(layout(INDEX_HTML));
});

app.get("/work", (c) => {
  setPublicCache(c, ["work"]);
  return c.html(layout(WORK_HTML));
});

app.get("/posts", async (c) => {
  // Drafts only on /admin/posts — public list is always visible posts.
  const [{ ongoing, dated }, tags] = await Promise.all([
    listPosts(c.env.POSTS),
    listTagNames(c.env.TAGS),
  ]);
  setPublicCache(c, ["posts"]);
  return c.html(layout(postsListHtml(ongoing, dated, tags)));
});

app.get("/posts-by-tag/:tag", async (c) => {
  const tag = (c.req.param("tag") ?? "").toLowerCase();
  if (!isValidTag(tag)) {
    setPublicCache(c, ["posts"], "notfound");
    return c.html(layout("<h2>404 NOT FOUND</h2>"), 404);
  }
  const listed = await listPostsByTag(c.env.POSTS, c.env.TAGS, tag);
  if (listed === null) {
    setPublicCache(c, [`tag-${tag}`], "notfound");
    return c.html(layout("<h2>404 NOT FOUND</h2>"), 404);
  }
  setPublicCache(c, ["posts", `tag-${listed.tag}`]);
  return c.html(layout(postsByTagHtml(listed.tag, listed.ongoing, listed.dated)));
});

app.get("/posts/:slug", async (c) => {
  let slug = c.req.param("slug") ?? "";
  const asMarkdown = slug.endsWith(".md");
  if (asMarkdown) {
    slug = slug.slice(0, -3);
  }

  const post = await getPost(c.env.POSTS, slug);
  if (post === null || !post.frontmatter.visible) {
    setPublicCache(c, slug ? [`post-${slug}`] : ["posts"], "notfound");
    if (asMarkdown) {
      c.header("Content-Type", "text/plain; charset=utf-8");
      return c.body("404 NOT FOUND", 404);
    }
    return c.html(layout("<h2>404 NOT FOUND</h2>"), 404);
  }

  const tags = [`post-${slug}`, ...post.frontmatter.tags.map((t) => `tag-${t}`)];
  setPublicCache(c, tags);

  // Raw markdown: body only (frontmatter stripped), no layout/nav.
  if (asMarkdown) {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(post.body);
  }

  const body = await marked.parse(post.body);
  return c.html(layout(postHtml(slug, body, post.frontmatter.tags)));
});

app.get("/login", (c) => loginRedirect(c));
app.get("/auth/callback", (c) => handleAuthCallback(c));
app.get("/logout", (c) => logoutAndRedirect(c));
app.post("/logout", (c) => logoutAndRedirect(c));

// Admin (auth required; linked from nav when signed in).
app.get("/admin", requireAuth, async (c) => {
  return c.html(
    layout(adminIndexHtml(), {
      robots: "noindex",
      isLoggedIn: true,
      wide: true,
    }),
  );
});

app.get("/admin/posts", requireAuth, async (c) => {
  const { ongoing, dated } = await listPosts(c.env.POSTS, {
    includeHidden: true,
  });
  return c.html(
    layout(adminPostsHtml(ongoing, dated), {
      robots: "noindex",
      isLoggedIn: true,
      wide: true,
    }),
  );
});

app.get("/admin/tags", requireAuth, async (c) => {
  const tags = await listTags(c.env.TAGS);
  return c.html(
    layout(adminTagsHtml(tags), {
      robots: "noindex",
      isLoggedIn: true,
      wide: true,
    }),
  );
});

app.post("/admin/tags/:tag/delete", requireAuth, async (c) => {
  const tag = (c.req.param("tag") ?? "").toLowerCase();
  const result = await deleteTag(c.env.POSTS, c.env.TAGS, tag);
  if (!result.ok) {
    return c.html(
      layout(
        `<h2>404 NOT FOUND</h2><p><a href="/admin/tags">← Tags</a></p>`,
        { robots: "noindex", isLoggedIn: true, wide: true },
      ),
      404,
    );
  }
  await purgePublic(c, ["posts", `tag-${tag}`]);
  return c.redirect("/admin/tags");
});

// Preview: full raw markdown in, strip frontmatter, return HTML fragment.
app.post("/admin/posts/preview", requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  const { body: mdBody } = parsePost(markdown);
  const html = await marked.parse(mdBody);
  return c.html(html);
});

// Static paths before :slug so "new" is not captured as a slug.
app.get("/admin/posts/new", requireAuth, async (c) => {
  return c.html(
    layout(adminPostNewHtml(NEW_POST_TEMPLATE), {
      robots: "noindex",
      isLoggedIn: true,
      wide: true,
      htmx: true,
    }),
  );
});

// Create post (form from /admin/posts/new).
app.post("/admin/posts", requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const markdown =
    typeof body.markdown === "string" ? body.markdown : NEW_POST_TEMPLATE;

  if (!isValidSlug(slug)) {
    return c.html(
      "<span>Invalid slug (letters, numbers, hyphens, underscores)</span>",
      400,
    );
  }

  const existing = await getPost(c.env.POSTS, slug);
  if (existing !== null) {
    return c.html("<span>Slug already exists</span>", 409);
  }

  await putPost(c.env.POSTS, slug, markdown);
  const { frontmatter } = parsePost(markdown);
  await syncPostTags(c.env.TAGS, slug, frontmatter.tags, []);
  await purgePublic(c, [
    "posts",
    `post-${slug}`,
    ...frontmatter.tags.map((t) => `tag-${t}`),
  ]);
  c.header("HX-Redirect", `/admin/posts/${slug}/edit`);
  return c.html("<span>Created</span>");
});

app.get("/admin/posts/:slug/edit", requireAuth, async (c) => {
  const slug = c.req.param("slug") ?? "";
  const post = await getPost(c.env.POSTS, slug);
  if (post === null) {
    return c.html(
      layout("<h2>404 NOT FOUND</h2>", {
        robots: "noindex",
        isLoggedIn: true,
        wide: true,
      }),
      404,
    );
  }
  return c.html(
    layout(
      adminPostEditHtml(slug, post.raw, {
        canDelete: !post.frontmatter.visible,
      }),
      {
        robots: "noindex",
        isLoggedIn: true,
        wide: true,
        htmx: true,
      },
    ),
  );
});

app.post("/admin/posts/:slug", requireAuth, async (c) => {
  const slug = c.req.param("slug") ?? "";
  const existing = await getPost(c.env.POSTS, slug);
  if (existing === null) {
    return c.html("<span>Not found</span>", 404);
  }
  const body = await c.req.parseBody();
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  await putPost(c.env.POSTS, slug, markdown);
  const { frontmatter } = parsePost(markdown);
  await syncPostTags(
    c.env.TAGS,
    slug,
    frontmatter.tags,
    existing.frontmatter.tags,
  );
  await purgePublic(c, [
    "posts",
    `post-${slug}`,
    ...frontmatter.tags.map((t) => `tag-${t}`),
    ...existing.frontmatter.tags.map((t) => `tag-${t}`),
  ]);
  return c.html("<span>Saved</span>");
});

// Only non-visible (draft) posts can be deleted.
app.post("/admin/posts/:slug/delete", requireAuth, async (c) => {
  const slug = c.req.param("slug") ?? "";
  const existing = await getPost(c.env.POSTS, slug);
  const result = await deletePost(c.env.POSTS, slug);
  if (!result.ok) {
    if (result.reason === "visible") {
      return c.html(
        layout(
          `<h2>Cannot delete</h2><p>Only non-visible posts can be deleted. Set <code>visible: false</code> first, or keep the post.</p><p><a href="/admin/posts">← Posts</a></p>`,
          { robots: "noindex", isLoggedIn: true, wide: true },
        ),
        403,
      );
    }
    return c.html(
      layout(
        `<h2>404 NOT FOUND</h2><p><a href="/admin/posts">← Posts</a></p>`,
        { robots: "noindex", isLoggedIn: true, wide: true },
      ),
      404,
    );
  }
  if (existing) {
    await unindexPost(c.env.TAGS, slug, existing.frontmatter.tags);
    await purgePublic(c, [
      "posts",
      `post-${slug}`,
      ...existing.frontmatter.tags.map((t) => `tag-${t}`),
    ]);
  }
  return c.redirect("/admin/posts");
});

app.notFound(async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) {
    return asset;
  }
  return c.html(layout("<h2>404 NOT FOUND</h2>"), 404);
});

app.onError(async (_err, c) => {
  return c.html(layout("<h2>500 SERVER ERROR</h2>"), 500);
});

export { app };

export class Public extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env, this.ctx);
  }

  async invalidate(args: { tags: string[] }): Promise<void> {
    const cache = (this.ctx as ExecutionContext & {
      cache?: { purge: (opts: { tags: string[] }) => Promise<unknown> };
    }).cache;
    if (cache) {
      await cache.purge({ tags: args.tags });
    }
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: GatewayExecutionCtx,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      isPublicCacheablePath(url.pathname) &&
      ctx.exports?.Public
    ) {
      const headers = new Headers(request.headers);
      headers.delete("Cookie");
      headers.delete("Authorization");
      return ctx.exports.Public.fetch(new Request(request, { headers }));
    }
    return app.fetch(request, env, ctx);
  },
};
