import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { marked } from "marked";
import { clearSession, getIsLoggedIn, loginUser, requireAuth } from "./auth";
import type { Env } from "./env";
import { isValidTag, parsePost } from "./frontmatter";
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
import {
  INDEX_HTML,
  WORK_HTML,
  adminIndexHtml,
  adminPostEditHtml,
  adminPostNewHtml,
  adminPostsHtml,
  adminTagsHtml,
  layout,
  loginHtml,
  postHtml,
  postsByTagHtml,
  postsListHtml,
} from "./html";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// Always allow prod + local origins. Do not gate on NODE_ENV — that var is
// often unset on Workers, which previously left live POSTs CSRF-blocked.
const CSRF_ORIGINS = [
  "https://www.toby.codes",
  "https://toby.codes",
  "http://localhost:8787",
  "http://localhost",
  "http://127.0.0.1:8787",
];

app.use("*", async (c, next) => csrf({ origin: CSRF_ORIGINS })(c, next));

app.get("/health", (c) => c.text("healthy"));

app.get("/robots.txt", (c) =>
  c.text("User-agent: *\nAllow: /\n", 200, {
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

app.get("/", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  return c.html(layout(INDEX_HTML, { isLoggedIn }));
});

app.get("/work", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  return c.html(layout(WORK_HTML, { isLoggedIn }));
});

app.get("/posts", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  // Drafts only on /admin/posts — public list is always visible posts.
  const [{ ongoing, dated }, tags] = await Promise.all([
    listPosts(c.env.POSTS),
    listTagNames(c.env.TAGS),
  ]);
  return c.html(layout(postsListHtml(ongoing, dated, tags), { isLoggedIn }));
});

app.get("/posts-by-tag/:tag", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  const tag = (c.req.param("tag") ?? "").toLowerCase();
  if (!isValidTag(tag)) {
    return c.html(layout("<h2>404 NOT FOUND</h2>", { isLoggedIn }), 404);
  }
  const listed = await listPostsByTag(c.env.POSTS, c.env.TAGS, tag);
  if (listed === null) {
    return c.html(layout("<h2>404 NOT FOUND</h2>", { isLoggedIn }), 404);
  }
  return c.html(
    layout(postsByTagHtml(listed.tag, listed.ongoing, listed.dated), {
      isLoggedIn,
    }),
  );
});

app.get("/posts/:slug", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  let slug = c.req.param("slug") ?? "";
  const asMarkdown = slug.endsWith(".md");
  if (asMarkdown) {
    slug = slug.slice(0, -3);
  }

  const post = await getPost(c.env.POSTS, slug);
  if (post === null || (!post.frontmatter.visible && !isLoggedIn)) {
    if (asMarkdown) {
      return c.text("404 NOT FOUND", 404, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }
    return c.html(layout("<h2>404 NOT FOUND</h2>", { isLoggedIn }), 404);
  }

  // Raw markdown: body only (frontmatter stripped), no layout/nav.
  if (asMarkdown) {
    return c.body(post.body, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
  }

  const body = await marked.parse(post.body);
  return c.html(
    layout(postHtml(slug, body, post.frontmatter.tags), { isLoggedIn }),
  );
});

// Unlisted auth routes (login not in nav; logout appears when signed in).
app.get("/login", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  if (isLoggedIn) {
    return c.redirect("/");
  }
  return c.html(layout(loginHtml(), { robots: "noindex", isLoggedIn: false }));
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const { username, password } = body;
  if (typeof username === "string" && typeof password === "string") {
    try {
      if (await loginUser(c, username, password)) {
        return c.redirect("/");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Login failed (server misconfigured)";
      return c.html(
        layout(loginHtml(msg), { robots: "noindex", isLoggedIn: false }),
        500,
      );
    }
  }
  return c.html(
    layout(loginHtml("Invalid credentials"), {
      robots: "noindex",
      isLoggedIn: false,
    }),
    401,
  );
});

app.get("/logout", (c) => {
  clearSession(c);
  return c.redirect("/");
});

app.post("/logout", (c) => {
  clearSession(c);
  return c.redirect("/");
});

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
  }
  return c.redirect("/admin/posts");
});

app.notFound(async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) {
    return asset;
  }
  const isLoggedIn = await getIsLoggedIn(c);
  return c.html(layout("<h2>404 NOT FOUND</h2>", { isLoggedIn }), 404);
});

app.onError(async (_err, c) => {
  const isLoggedIn = await getIsLoggedIn(c).catch(() => false);
  return c.html(layout("<h2>500 SERVER ERROR</h2>", { isLoggedIn }), 500);
});

export { app };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
