import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  clearSession,
  getIsLoggedIn,
  loginUser,
  requireAuth,
} from "./auth";
import type { Env } from "./env";
import {
  homeHtml,
  layout,
  loginHtml,
  notFoundHtml,
  pictureEditHtml,
  pictureNewHtml,
  pictureShowHtml,
  picturesIndexHtml,
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

const CSRF_ORIGINS = [
  "https://jasmijnvink.com",
  "https://www.jasmijnvink.com",
  "http://localhost:8787",
  "http://localhost",
  "http://127.0.0.1:8787",
];

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname === "www.jasmijnvink.com") {
    url.hostname = "jasmijnvink.com";
    return c.redirect(url.toString(), 301);
  }
  await next();
});

app.use("*", async (c, next) => csrf({ origin: CSRF_ORIGINS })(c, next));

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
  deleteCookie(c, "flash", { path: "/" });
  if (!raw) {
    return {};
  }
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
  const isLoggedIn = await getIsLoggedIn(c);
  const flash = takeFlash(c);
  return c.html(layout(body, { isLoggedIn, ...flash, ...extra }));
}

app.get("/health", (c) => c.text("healthy"));

app.get("/", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  const all = await listPictures(c.env.PICTURES, { includeHidden: isLoggedIn });
  return page(c, homeHtml(all.slice(0, 3), isLoggedIn));
});

app.get("/random", async (c) => {
  const visible = await listPictures(c.env.PICTURES, { includeHidden: false });
  if (visible.length === 0) {
    setFlash(c, { notice: "Geen beelden beschikbaar" });
    return c.redirect("/");
  }
  const pick = visible[Math.floor(Math.random() * visible.length)];
  return c.redirect(`/pictures/${pick.id}`);
});

app.get("/inloggen", async (c) => {
  if (await getIsLoggedIn(c)) {
    return c.redirect("/");
  }
  return page(c, loginHtml(), { title: "Inloggen" });
});

app.post("/inloggen", async (c) => {
  const body = await c.req.parseBody();
  const email = asString(body.email);
  const password = asString(body.password);
  const remember = asString(body.remember_me) === "1";
  try {
    if (await loginUser(c, email, password, remember)) {
      return c.redirect("/");
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Inloggen mislukt (server misconfigured)";
    return c.html(layout(loginHtml(msg), { isLoggedIn: false }), 500);
  }
  return c.html(
    layout(loginHtml("Ongeldige inloggegevens"), { isLoggedIn: false }),
    401,
  );
});

app.get("/uitloggen", (c) => {
  clearSession(c);
  return c.redirect("/");
});

app.post("/uitloggen", (c) => {
  clearSession(c);
  return c.redirect("/");
});

app.get("/tags", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  const tags = await listTags(c.env.TAGS);
  return page(c, tagsIndexHtml(tags, isLoggedIn));
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
  return c.redirect("/tags");
});

app.post("/tags/:tag/delete", requireAuth, async (c) => {
  const tag = (c.req.param("tag") ?? "").toLowerCase();
  const result = await deleteTag(c.env.PICTURES, c.env.TAGS, tag);
  if (!result.ok) {
    const isLoggedIn = await getIsLoggedIn(c);
    return c.html(layout(notFoundHtml(), { isLoggedIn }), 404);
  }
  return c.redirect("/tags");
});

app.get("/tags/:tag", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  const tag = (c.req.param("tag") ?? "").toLowerCase();
  const ids = await getTagPictureIds(c.env.TAGS, tag);
  if (ids === null) {
    return c.html(
      layout(notFoundHtml(), { isLoggedIn }),
      404,
    );
  }
  const pictures: Picture[] = [];
  for (const id of ids) {
    const p = await getPicture(c.env.PICTURES, id);
    if (!p) {
      continue;
    }
    if (!p.visible && !isLoggedIn) {
      continue;
    }
    pictures.push(p);
  }
  pictures.sort((a, b) => Number(b.id) - Number(a.id));
  return page(c, tagShowHtml(tag, pictures, isLoggedIn));
});

app.get("/pictures", async (c) => {
  const isLoggedIn = await getIsLoggedIn(c);
  const pictures = await listPictures(c.env.PICTURES, {
    includeHidden: isLoggedIn,
  });
  return page(c, picturesIndexHtml(pictures, isLoggedIn));
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

app.get("/pictures/:id/image", async (c) => {
  const id = c.req.param("id") ?? "";
  const picture = await getPicture(c.env.PICTURES, id);
  const isLoggedIn = await getIsLoggedIn(c);
  if (!picture || (!picture.visible && !isLoggedIn)) {
    return c.notFound();
  }
  const object = await c.env.IMAGES.get(picture.r2Key);
  if (!object) {
    return c.notFound();
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", picture.contentType);
  headers.set(
    "Cache-Control",
    picture.visible ? "public, max-age=86400" : "private, no-store",
  );
  return c.body(object.body, { headers });
});

app.get("/pictures/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  const picture = await getPicture(c.env.PICTURES, id);
  const isLoggedIn = await getIsLoggedIn(c);
  if (!picture || (!picture.visible && !isLoggedIn)) {
    return c.html(layout(notFoundHtml(), { isLoggedIn }), 404);
  }
  return page(c, pictureShowHtml(picture, isLoggedIn), {
    title: picture.title,
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
  setFlash(c, { notice: "Afbeelding verwijderd" });
  return c.redirect("/pictures");
});

app.notFound(async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) {
    return asset;
  }
  const isLoggedIn = await getIsLoggedIn(c);
  return c.html(layout(notFoundHtml(), { isLoggedIn }), 404);
});

app.onError(async (_err, c) => {
  const isLoggedIn = await getIsLoggedIn(c).catch(() => false);
  return c.html(layout("<h1>500 SERVER ERROR</h1>", { isLoggedIn }), 500);
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
