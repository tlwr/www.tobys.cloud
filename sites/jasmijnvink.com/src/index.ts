import { WorkerEntrypoint } from "cloudflare:workers";
import { originAllowed } from "@tobys/auth-client";
import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  getIsLoggedIn,
  handleAuthCallback,
  loginRedirect,
  logoutAndRedirect,
  requireAuth,
} from "./auth";
import {
  IMAGE_CACHE_CONTROL,
  PRIVATE_NO_STORE,
  isPublicCacheablePath,
  pictureCacheTags,
  purgePublic,
  setPublicCache,
  uniqueTags,
  type GatewayExecutionCtx,
} from "./cache";
import type { Env } from "./env";
import {
  flashHtml,
  homeHtml,
  layout,
  notFoundHtml,
  pictureEditHtml,
  pictureEditLinkHtml,
  pictureNewHtml,
  pictureShowHtml,
  picturesIndexHtml,
  sessionNavHtml,
  tagDeleteFormsHtml,
  tagNewHtml,
  tagShowHtml,
  tagsIndexHtml,
} from "./html";
import {
  deletePicture,
  getPicture,
  listPictures,
  nextPictureId,
  putPicture,
  r2KeyFor,
  validateImage,
  type Picture,
} from "./pictures";
import {
  createTag,
  deleteTag,
  getTagPictureIds,
  isValidTag,
  listTags,
  syncPictureTags,
} from "./tags";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname === "www.jasmijnvink.com") {
    url.hostname = "jasmijnvink.com";
    setPublicCache(c, ["canonical"]);
    return c.redirect(url.toString(), 301);
  }
  await next();
});

app.use(
  "*",
  csrf({
    origin: (origin, c) =>
      originAllowed("jvnl", origin, new URL(c.req.url).origin),
  }),
);

type AppContext = Context<{ Bindings: Env }>;

function setFlash(
  c: AppContext,
  flash: { notice?: string; alert?: string },
): void {
  setCookie(c, "flash", JSON.stringify(flash), {
    path: "/",
    maxAge: 60,
    httpOnly: true,
  });
}

function takeFlash(c: AppContext): {
  notice?: string;
  alert?: string;
} {
  const raw = getCookie(c, "flash");
  if (!raw) {
    return {};
  }
  deleteCookie(c, "flash", { path: "/" });
  try {
    const parsed = JSON.parse(raw) as { notice?: string; alert?: string };
    return {
      notice: typeof parsed.notice === "string" ? parsed.notice : undefined,
      alert: typeof parsed.alert === "string" ? parsed.alert : undefined,
    };
  } catch {
    return {};
  }
}

function asString(v: unknown): string {
  if (typeof v === "string") {
    return v;
  }
  if (Array.isArray(v) && typeof v[0] === "string") {
    return v[0];
  }
  return "";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string");
  }
  if (typeof v === "string" && v) {
    return [v];
  }
  return [];
}

async function page(
  c: AppContext,
  body: string,
  extra: { title?: string } = {},
): Promise<Response> {
  const flash = takeFlash(c);
  return c.html(layout(body, { isLoggedIn: true, ...flash, ...extra }));
}

function publicPage(
  c: AppContext,
  body: string,
  extra: { title?: string; tags?: string[]; notfound?: boolean } = {},
): Response {
  setPublicCache(
    c,
    extra.tags ?? ["pictures"],
    extra.notfound ? "notfound" : "ok",
  );
  return c.html(layout(body, { title: extra.title }), extra.notfound ? 404 : 200);
}

app.get("/health", (c) => c.text("healthy"));

app.get("/session-nav", async (c) => {
  c.header("Cache-Control", PRIVATE_NO_STORE);
  const flash = flashHtml(takeFlash(c));
  const oob = flash
    ? `<div id="session-flash" hx-swap-oob="true">${flash}</div>`
    : "";
  const isLoggedIn = await getIsLoggedIn(c);
  return c.html(`${oob}${isLoggedIn ? sessionNavHtml() : ""}`);
});

app.get("/session-page", async (c) => {
  c.header("Cache-Control", PRIVATE_NO_STORE);
  if (!(await getIsLoggedIn(c))) {
    return c.html("");
  }
  const path = c.req.query("path") ?? "";
  const pictureMatch = /^\/pictures\/(\d+)$/.exec(path);
  if (pictureMatch) {
    const picture = await getPicture(c.env.PICTURES, pictureMatch[1]);
    if (!picture) {
      return c.html("");
    }
    return c.html(pictureEditLinkHtml(picture.id));
  }
  if (path === "/tags") {
    const tags = await listTags(c.env.TAGS);
    return c.html(tagDeleteFormsHtml(tags));
  }
  return c.html("");
});

app.get("/", async (c) => {
  const all = await listPictures(c.env.PICTURES, { includeHidden: false });
  return publicPage(c, homeHtml(all.slice(0, 3)), { tags: ["pictures"] });
});

app.get("/random", async (c) => {
  c.header("Cache-Control", PRIVATE_NO_STORE);
  const visible = await listPictures(c.env.PICTURES, { includeHidden: false });
  if (visible.length === 0) {
    setFlash(c, { notice: "Geen beelden beschikbaar" });
    return c.redirect("/");
  }
  const pick = visible[Math.floor(Math.random() * visible.length)];
  return c.redirect(`/pictures/${pick.id}`);
});

app.get("/inloggen", (c) => loginRedirect(c));
app.get("/auth/callback", (c) => handleAuthCallback(c));
app.get("/uitloggen", (c) => logoutAndRedirect(c));
app.post("/uitloggen", (c) => logoutAndRedirect(c));

app.get("/tags", async (c) => {
  const tags = await listTags(c.env.TAGS);
  return publicPage(c, tagsIndexHtml(tags), { tags: ["pictures", "tags"] });
});

app.get("/tags/new", requireAuth, async (c) => {
  return page(c, tagNewHtml(), { title: "Tag aanmaken" });
});

app.post("/tags", requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const id = asString(body.id).trim().toLowerCase();
  const result = await createTag(c.env.TAGS, id);
  if (!result.ok) {
    const errors =
      result.reason === "exists"
        ? ["Tag bestaat al"]
        : ["Tag naam must be kebab-case"];
    return page(c, tagNewHtml({ id, errors }), { title: "Tag aanmaken" });
  }
  await purgePublic(c, ["pictures", "tags", `tag-${id}`]);
  return c.redirect("/tags");
});

app.post("/tags/:tag/delete", requireAuth, async (c) => {
  const tag = (c.req.param("tag") ?? "").toLowerCase();
  const result = await deleteTag(c.env.PICTURES, c.env.TAGS, tag);
  if (!result.ok) {
    return c.html(layout(notFoundHtml(), { isLoggedIn: true }), 404);
  }
  await purgePublic(c, ["pictures", "tags", `tag-${tag}`]);
  return c.redirect("/tags");
});

app.get("/tags/:tag", async (c) => {
  const tag = (c.req.param("tag") ?? "").toLowerCase();
  const ids = await getTagPictureIds(c.env.TAGS, tag);
  if (ids === null) {
    return publicPage(c, notFoundHtml(), {
      tags: [`tag-${tag}`],
      notfound: true,
    });
  }
  const pictures: Picture[] = [];
  for (const id of ids) {
    const p = await getPicture(c.env.PICTURES, id);
    if (!p || !p.visible) {
      continue;
    }
    pictures.push(p);
  }
  pictures.sort((a, b) => Number(b.id) - Number(a.id));
  return publicPage(c, tagShowHtml(tag, pictures), {
    tags: ["pictures", `tag-${tag}`],
  });
});

app.get("/pictures", async (c) => {
  const pictures = await listPictures(c.env.PICTURES, {
    includeHidden: false,
  });
  return publicPage(c, picturesIndexHtml(pictures), { tags: ["pictures"] });
});

app.get("/pictures/new", requireAuth, async (c) => {
  const tags = (await listTags(c.env.TAGS)).map((t) => t.tag);
  return page(c, pictureNewHtml(tags), { title: "Uploaden" });
});

app.post("/pictures", requireAuth, async (c) => {
  const body = await c.req.parseBody({ all: true });
  const title = asString(body.title).trim();
  const description = asString(body.description);
  const visible = asString(body.visible) === "1";
  const tagIds = asStringArray(body.tag_ids).filter(isValidTag);
  const fileRaw = body.image;
  const file = Array.isArray(fileRaw) ? fileRaw[0] : fileRaw;
  const tags = (await listTags(c.env.TAGS)).map((t) => t.tag);
  const errors: string[] = [];

  if (!title) {
    errors.push("Titel moet opgegeven zijn");
  }
  if (!(file instanceof File) || file.size === 0) {
    errors.push("Afbeelding moet opgegeven zijn");
  } else {
    const imgErr = validateImage(file.type, file.size);
    if (imgErr) {
      errors.push(imgErr);
    }
  }

  if (errors.length > 0) {
    return page(
      c,
      pictureNewHtml(tags, {
        title,
        description,
        visible,
        tagIds,
        errors,
      }),
      { title: "Uploaden" },
    );
  }

  const image = file as File;
  const id = await nextPictureId(c.env.PICTURES);
  const r2Key = r2KeyFor(id);
  await c.env.IMAGES.put(r2Key, await image.arrayBuffer(), {
    httpMetadata: { contentType: image.type },
  });
  const picture: Picture = {
    id,
    title,
    description,
    visible,
    tags: tagIds,
    r2Key,
    contentType: image.type,
    createdAt: new Date().toISOString(),
  };
  await putPicture(c.env.PICTURES, picture);
  await syncPictureTags(c.env.TAGS, id, tagIds, []);
  await purgePublic(c, pictureCacheTags(id, tagIds));
  setFlash(c, { notice: "Afbeelding geüpload" });
  return c.redirect(`/pictures/${id}`);
});

app.get("/pictures/:id/edit", requireAuth, async (c) => {
  const id = c.req.param("id") ?? "";
  const picture = await getPicture(c.env.PICTURES, id);
  if (!picture) {
    return c.html(layout(notFoundHtml(), { isLoggedIn: true }), 404);
  }
  const tags = (await listTags(c.env.TAGS)).map((t) => t.tag);
  return page(c, pictureEditHtml(picture, tags), { title: "Bewerken" });
});

app.get("/pictures/:id/preview", requireAuth, async (c) => {
  const id = c.req.param("id") ?? "";
  const picture = await getPicture(c.env.PICTURES, id);
  if (!picture) {
    return c.notFound();
  }
  const object = await c.env.IMAGES.get(picture.r2Key);
  if (!object) {
    return c.notFound();
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", picture.contentType);
  headers.set("Cache-Control", PRIVATE_NO_STORE);
  return c.body(object.body, { headers });
});

app.get("/pictures/:id/image", async (c) => {
  const id = c.req.param("id") ?? "";
  const picture = await getPicture(c.env.PICTURES, id);
  if (!picture || !picture.visible) {
    setPublicCache(c, id ? [`image-${id}`] : ["pictures"], "notfound");
    return c.notFound();
  }
  const object = await c.env.IMAGES.get(picture.r2Key);
  if (!object) {
    setPublicCache(c, [`image-${id}`], "notfound");
    return c.notFound();
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", picture.contentType);
  headers.set("Cache-Control", IMAGE_CACHE_CONTROL);
  headers.set(
    "Cache-Tag",
    uniqueTags(["pages", "pictures", `image-${id}`, `picture-${id}`]).join(","),
  );
  return c.body(object.body, { headers });
});

app.get("/pictures/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  const picture = await getPicture(c.env.PICTURES, id);
  if (!picture || !picture.visible) {
    return publicPage(c, notFoundHtml(), {
      tags: id ? [`picture-${id}`] : ["pictures"],
      notfound: true,
    });
  }
  return publicPage(c, pictureShowHtml(picture), {
    title: picture.title,
    tags: pictureCacheTags(picture.id, picture.tags),
  });
});

app.post("/pictures/:id", requireAuth, async (c) => {
  const id = c.req.param("id") ?? "";
  const existing = await getPicture(c.env.PICTURES, id);
  if (!existing) {
    return c.html(layout(notFoundHtml(), { isLoggedIn: true }), 404);
  }
  const body = await c.req.parseBody({ all: true });
  const title = asString(body.title).trim();
  const description = asString(body.description);
  const visible = asString(body.visible) === "1";
  const tagIds = asStringArray(body.tag_ids).filter(isValidTag);
  const allTags = (await listTags(c.env.TAGS)).map((t) => t.tag);

  if (!title) {
    return page(
      c,
      pictureEditHtml({ ...existing, title, description, visible, tags: tagIds }, allTags, [
        "Titel moet opgegeven zijn",
      ]),
      { title: "Bewerken" },
    );
  }

  const next: Picture = {
    ...existing,
    title,
    description,
    visible,
    tags: tagIds,
  };
  await putPicture(c.env.PICTURES, next);
  await syncPictureTags(c.env.TAGS, id, tagIds, existing.tags);
  await purgePublic(c, [
    ...pictureCacheTags(id, tagIds),
    ...existing.tags.map((t) => `tag-${t}`),
  ]);
  setFlash(c, { notice: "Afbeelding bijgewerkt" });
  return c.redirect(`/pictures/${id}`);
});

app.post("/pictures/:id/delete", requireAuth, async (c) => {
  const id = c.req.param("id") ?? "";
  const existing = await getPicture(c.env.PICTURES, id);
  if (!existing) {
    return c.html(layout(notFoundHtml(), { isLoggedIn: true }), 404);
  }
  await deletePicture(c.env.PICTURES, id);
  await c.env.IMAGES.delete(existing.r2Key);
  await syncPictureTags(c.env.TAGS, id, [], existing.tags);
  await purgePublic(c, pictureCacheTags(id, existing.tags));
  setFlash(c, { notice: "Afbeelding verwijderd" });
  return c.redirect("/pictures");
});

app.notFound(async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) {
    return asset;
  }
  return c.html(layout(notFoundHtml()), 404);
});

app.onError(async (_err, c) => {
  return c.html(layout("<h1>500 SERVER ERROR</h1>"), 500);
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
