import { describe, expect, it, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "./index";
import type { Env } from "./env";
import type { Picture } from "./pictures";

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

function env(
  users: MemoryKV,
  pictures: MemoryKV,
  tags: MemoryKV,
  images?: MemoryR2,
): Env {
  return {
    ASSETS: assets404,
    USERS: users as unknown as KVNamespace,
    PICTURES: pictures as unknown as KVNamespace,
    TAGS: tags as unknown as KVNamespace,
    IMAGES: (images ?? new MemoryR2()) as unknown as R2Bucket,
    SESSION_SECRET: "test-session-secret",
  };
}

async function loginCookie(
  users: MemoryKV,
  pictures: MemoryKV,
  tags: MemoryKV,
): Promise<string> {
  const body = new URLSearchParams({
    email: "jasmijn@example.com",
    password: "s3cret",
  });
  const loginRes = await app.request(
    "/inloggen",
    {
      method: "POST",
      body,
      headers: { Origin: "http://localhost" },
    },
    env(users, pictures, tags),
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

describe("jasmijnvink.com", () => {
  let users: MemoryKV;
  let pictures: MemoryKV;
  let tags: MemoryKV;
  let images: MemoryR2;

  beforeEach(async () => {
    users = new MemoryKV();
    const hashedPassword = await bcrypt.hash("s3cret", 4);
    await users.put(
      "jasmijn@example.com",
      JSON.stringify({
        username: "jasmijn@example.com",
        hashedPassword,
      }),
    );
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
    expect(res.headers.get("location")).toBe("/inloggen");
  });

  it("logged-in user sees hidden pictures and can upload", async () => {
    const cookie = await loginCookie(users, pictures, tags);
    const e = env(users, pictures, tags, images);

    const home = await app.request(
      "/",
      { headers: { Cookie: cookie, Origin: "http://localhost" } },
      e,
    );
    const homeHtml = await home.text();
    expect(homeHtml).toContain("uitloggen");
    expect(homeHtml).toContain("Onzichtbaar");
    expect(homeHtml).toContain("uploaden");

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
