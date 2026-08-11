import { describe, expect, it } from "vitest";
import { getPost, listPosts } from "./posts";

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

describe("posts", () => {
  it("falls back to bundled posts when KV is empty", async () => {
    const kv = new MemoryKV() as unknown as KVNamespace;
    const { ongoing, dated } = await listPosts(kv);
    expect(ongoing.length).toBeGreaterThan(0);
    expect(dated.length).toBeGreaterThan(0);

    const fosdem = dated.find((p) => p.slug === "2020-02-FOSDEM-2020");
    expect(fosdem).toBeDefined();
    expect(fosdem?.visible).toBe(true);

    const post = await getPost(kv, "2020-02-FOSDEM-2020");
    expect(post?.body).toContain("Eurostar");
  });

  it("prefers KV and hides drafts from public list", async () => {
    const kv = new MemoryKV({
      Public: "---\nvisible: true\n---\n# Public\n",
      Draft: "---\nvisible: false\n---\n# Draft\n",
    }) as unknown as KVNamespace;

    const publicList = await listPosts(kv, { includeHidden: false });
    expect(publicList.ongoing.map((p) => p.slug)).toEqual(["Public"]);
    expect(publicList.ongoing.find((p) => p.slug === "Draft")).toBeUndefined();

    const all = await listPosts(kv, { includeHidden: true });
    expect(all.ongoing.map((p) => p.slug).sort()).toEqual(["Draft", "Public"]);
  });

  it("strips frontmatter from body", async () => {
    const kv = new MemoryKV({
      Sample: "---\nvisible: true\n---\n# Title\n\nBody text.\n",
    }) as unknown as KVNamespace;

    const post = await getPost(kv, "Sample");
    expect(post?.frontmatter.visible).toBe(true);
    expect(post?.body).toBe("# Title\n\nBody text.\n");
    expect(post?.body).not.toContain("visible:");
  });

  it("returns null for missing posts", async () => {
    const kv = new MemoryKV() as unknown as KVNamespace;
    expect(await getPost(kv, "does-not-exist")).toBeNull();
    expect(await getPost(kv, "../etc/passwd")).toBeNull();
  });
});
