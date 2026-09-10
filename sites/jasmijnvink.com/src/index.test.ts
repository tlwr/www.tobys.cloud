import { describe, expect, it, beforeEach } from "vitest";
import { app } from "./index";
import type { Env } from "./env";
import type { Picture } from "./pictures";
import { issuePayload, signAuthToken } from "@tobys/auth-client";

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

class MemoryR2 {
  private store = new Map<string, { body: Uint8Array; contentType?: string }>();

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    let body: Uint8Array;
    if (typeof value === "string") {
      body = new TextEncoder().encode(value);
    } else if (ArrayBuffer.isView(value)) {
      body = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else {
      body = new Uint8Array(value);
    }
    this.store.set(key, {
      body,
      contentType: opts?.httpMetadata?.contentType,
    });
  }

  async get(key: string) {
    const v = this.store.get(key);
    if (!v) {
      return null;
    }
    return {
      body: v.body,
      httpEtag: '"etag"',
      writeHttpMetadata(headers: Headers) {
        if (v.contentType) {
          headers.set("Content-Type", v.contentType);
        }
      },
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const assets404 = {
  fetch: async () => new Response("not found", { status: 404 }),
} as unknown as Fetcher;

function pic(partial: Partial<Picture> & { id: string; title: string }): Picture {
  return {
    description: "",
    visible: true,
    tags: [],
    r2Key: `pictures/${partial.id}`,
    contentType: "image/svg+xml",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const JWT = "test-jwt-secret-at-least-32-chars!!";

function env(
  _users: MemoryKV,
  pictures: MemoryKV,
  tags: MemoryKV,
  images?: MemoryR2,
): Env {
  return {
    ASSETS: assets404,
    PICTURES: pictures as unknown as KVNamespace,
    TAGS: tags as unknown as KVNamespace,
    IMAGES: (images ?? new MemoryR2()) as unknown as R2Bucket,
    AUTH_JWT_SECRET: JWT,
    AUTH_ISSUER: "https://auth.tobys.cloud",
  };
}

async function loginCookie(
  _users: MemoryKV,
  _pictures: MemoryKV,
  _tags: MemoryKV,
): Promise<string> {
  const jwt = await signAuthToken(
    JWT,
    issuePayload(
      "jasmijn@example.com",
      "jvnl",
      ["jvnl:admin"],
      "session",
      3600,
    ),
  );
  return `auth_session=${jwt}`;
}

describe("jasmijnvink.com", () => {
  let users: MemoryKV;
  let pictures: MemoryKV;
  let tags: MemoryKV;
  let images: MemoryR2;

  beforeEach(async () => {
    users = new MemoryKV();
    pictures = new MemoryKV({
      "1": JSON.stringify(
        pic({ id: "1", title: "Zichtbaar", visible: true, tags: ["portret"] }),
      ),
      "2": JSON.stringify(
        pic({ id: "2", title: "Verborgen", visible: false, tags: ["portret"] }),
      ),
      "3": JSON.stringify(pic({ id: "3", title: "Tweede", visible: true })),
    });
    tags = new MemoryKV({
      portret: JSON.stringify(["1", "2"]),
    });
    images = new MemoryR2();
    const svg = "<svg xmlns='http://www.w3.org/2000/svg'/>";
    await images.put("pictures/1", svg, {
      httpMetadata: { contentType: "image/svg+xml" },
    });
    await images.put("pictures/2", svg, {
      httpMetadata: { contentType: "image/svg+xml" },
    });
    await images.put("pictures/3", svg, {
      httpMetadata: { contentType: "image/svg+xml" },
    });
  });

  it("homepage shows latest visible pictures and no login link", async () => {
    const res = await app.request("/", {}, env(users, pictures, tags, images));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Jasmijn Vink");
    expect(html).toContain("alle beelden");
    expect(html).toContain("Zichtbaar");
    expect(html).not.toContain("Verborgen");
    expect(html).not.toContain("inloggen");
    expect(html).not.toContain("href=\"/inloggen\"");
    expect(html).toContain('hx-get="/session-nav"');
    expect(html).toContain("site-nav-primary");
    expect(html).not.toContain("uploaden");
    expect(html).not.toContain("uitloggen");
    expect(res.headers.get("cache-control")).toContain("public");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("pictures index hides drafts for anonymous users", async () => {
    const res = await app.request(
      "/pictures",
      {},
      env(users, pictures, tags, images),
    );
    const html = await res.text();
    expect(html).toContain("Zichtbaar");
    expect(html).toContain("Tweede");
    expect(html).not.toContain("Verborgen");
  });

  it("404s hidden pictures and images for anonymous users", async () => {
    const show = await app.request(
      "/pictures/2",
      {},
      env(users, pictures, tags, images),
    );
    expect(show.status).toBe(404);
    const img = await app.request(
      "/pictures/2/image",
      {},
      env(users, pictures, tags, images),
    );
    expect(img.status).toBe(404);
  });

  it("serves visible image bytes", async () => {
    const res = await app.request(
      "/pictures/1/image",
      {},
      env(users, pictures, tags, images),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("svg");
    expect(res.headers.get("cache-control")).toContain("public");
    expect(res.headers.get("cache-tag")).toContain("image-1");
  });

  it("random redirects to a visible picture", async () => {
    const res = await app.request(
      "/random",
      {},
      env(users, pictures, tags, images),
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toMatch(/^\/pictures\/(1|3)$/);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("tag show lists only visible pictures for anonymous", async () => {
    const res = await app.request(
      "/tags/portret",
      {},
      env(users, pictures, tags, images),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Zichtbaar");
    expect(html).not.toContain("Verborgen");
  });

  it("redirects unauthenticated writes to inloggen", async () => {
    const res = await app.request(
      "/pictures/new",
      {},
      env(users, pictures, tags, images),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/authorize");
  });

  it("session fragments show admin chrome; public HTML stays anonymous", async () => {
    const cookie = await loginCookie(users, pictures, tags);
    const e = env(users, pictures, tags, images);

    const home = await app.request(
      "/",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      e,
    );
    const homeHtml = await home.text();
    expect(homeHtml).toContain('hx-get="/session-nav"');
    expect(homeHtml).not.toContain("uitloggen");
    expect(homeHtml).not.toContain("Onzichtbaar");
    expect(homeHtml).not.toContain("uploaden");

    const nav = await app.request(
      "/session-nav",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      e,
    );
    expect(nav.headers.get("cache-control")).toContain("no-store");
    const navHtml = await nav.text();
    expect(navHtml).toContain("uitloggen");
    expect(navHtml).toContain("uploaden");
    expect(navHtml).toContain("site-nav-admin");

    const actions = await app.request(
      "/session-page?path=/pictures/1",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      e,
    );
    expect(await actions.text()).toContain("Bewerken");

    const hidden = await app.request(
      "/pictures/2",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      e,
    );
    expect(hidden.status).toBe(404);
    const editHidden = await app.request(
      "/pictures/2/edit",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      e,
    );
    expect(editHidden.status).toBe(200);
    expect(await editHidden.text()).toContain("Verborgen");
  });

  it("logged-in user can upload", async () => {
    const cookie = await loginCookie(users, pictures, tags);
    const e = env(users, pictures, tags, images);

    const svg = new File(
      ["<svg xmlns='http://www.w3.org/2000/svg'/>"],
      "n.svg",
      { type: "image/svg+xml" },
    );
    const form = new FormData();
    form.set("title", "Nieuw");
    form.set("description", "desc");
    form.set("visible", "1");
    form.set("tag_ids", "portret");
    form.set("image", svg);

    const create = await app.request(
      "/pictures",
      {
        method: "POST",
        body: form,
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      e,
    );
    expect(create.status).toBe(302);
    expect(create.headers.get("location")).toBe("/pictures/4");
    expect(await pictures.get("4")).toContain("Nieuw");
  });

  it("rejects invalid image type", async () => {
    const cookie = await loginCookie(users, pictures, tags);
    const form = new FormData();
    form.set("title", "Bad");
    form.set("image", new File(["hello"], "x.txt", { type: "text/plain" }));
    const res = await app.request(
      "/pictures",
      {
        method: "POST",
        body: form,
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      env(users, pictures, tags, images),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("JPEG, PNG, GIF, WebP, SVG");
  });

  it("updates a picture with multiple tags (duplicate form keys)", async () => {
    const cookie = await loginCookie(users, pictures, tags);
    await tags.put("bergen", JSON.stringify([]));
    const body = new URLSearchParams();
    body.append("title", "Zichtbaar");
    body.append("description", "");
    body.append("visible", "1");
    body.append("tag_ids", "portret");
    body.append("tag_ids", "bergen");
    const res = await app.request(
      "/pictures/1",
      {
        method: "POST",
        body,
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      env(users, pictures, tags, images),
    );
    expect(res.status).toBe(302);
    const stored = JSON.parse((await pictures.get("1"))!);
    expect(stored.tags.sort()).toEqual(["bergen", "portret"]);
    expect(JSON.parse((await tags.get("bergen"))!)).toContain("1");
    expect(JSON.parse((await tags.get("portret"))!)).toContain("1");
  });

  it("creates and deletes a tag", async () => {
    const cookie = await loginCookie(users, pictures, tags);
    const e = env(users, pictures, tags, images);

    const create = await app.request(
      "/tags",
      {
        method: "POST",
        body: new URLSearchParams({ id: "zwart-wit" }),
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      e,
    );
    expect(create.status).toBe(302);
    expect(await tags.get("zwart-wit")).toBe("[]");

    const del = await app.request(
      "/tags/portret/delete",
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost" },
      },
      e,
    );
    expect(del.status).toBe(302);
    expect(await tags.get("portret")).toBeNull();
    expect(await pictures.get("1")).not.toContain("portret");
    expect(await pictures.get("1")).toContain("Zichtbaar");
  });
});
