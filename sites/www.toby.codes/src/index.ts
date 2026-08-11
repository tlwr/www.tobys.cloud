import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { marked } from "marked";
import { clearSession, getIsLoggedIn, loginUser } from "./auth";
import type { Env } from "./env";
import { getPostMarkdown, listPosts } from "./posts";
import {
  INDEX_HTML,
  WORK_HTML,
  layout,
  loginHtml,
  postHtml,
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
  const { ongoing, dated } = listPosts();
  return c.html(layout(postsListHtml(ongoing, dated), { isLoggedIn }));
});

app.get("/posts/:slug", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  const slug = c.req.param("slug");
  const markdown = getPostMarkdown(slug);
  if (markdown === null) {
    return c.html(layout("<h2>404 NOT FOUND</h2>", { isLoggedIn }), 404);
  }

  const body = await marked.parse(markdown);
  return c.html(layout(postHtml(body), { isLoggedIn }));
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
    if (await loginUser(c, username, password)) {
      return c.redirect("/");
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
