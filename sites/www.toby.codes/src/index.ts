import { Hono } from "hono";
import { marked } from "marked";
import { getPostMarkdown, listPosts } from "./posts";
import {
  INDEX_HTML,
  WORK_HTML,
  layout,
  postHtml,
  postsListHtml,
} from "./html";

export type Env = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("healthy"));

app.get("/robots.txt", (c) =>
  c.text("User-agent: *\nAllow: /\n", 200, {
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

app.get("/", (c) => c.html(layout(INDEX_HTML)));

app.get("/work", (c) => c.html(layout(WORK_HTML)));

app.get("/posts", (c) => {
  const { ongoing, dated } = listPosts();
  return c.html(layout(postsListHtml(ongoing, dated)));
});

app.get("/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const markdown = getPostMarkdown(slug);
  if (markdown === null) {
    return c.html(layout("<h2>404 NOT FOUND</h2>"), 404);
  }

  const body = await marked.parse(markdown);
  return c.html(layout(postHtml(body)));
});

app.notFound(async (c) => {
  // Prefer static assets (images, pdf, stl) when present.
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) {
    return asset;
  }
  return c.html(layout("<h2>404 NOT FOUND</h2>"), 404);
});

app.onError((_err, c) => c.html(layout("<h2>500 SERVER ERROR</h2>"), 500));

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
