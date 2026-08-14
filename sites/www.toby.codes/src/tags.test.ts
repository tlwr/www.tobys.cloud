import { describe, expect, it } from "vitest";
import {
  deleteTag,
  listPostsByTag,
  listTagNames,
  syncPostTags,
  unindexPost,
} from "./tags";
import { getPost, putPost } from "./posts";

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

describe("tags", () => {
  it("syncs membership and lists alphabetically", async () => {
    const tags = new MemoryKV() as unknown as KVNamespace;
    await syncPostTags(tags, "Post-A", ["workers", "cloudflare"], []);
    await syncPostTags(tags, "Post-B", ["workers"], []);

    expect(await listTagNames(tags)).toEqual(["cloudflare", "workers"]);
    expect(JSON.parse((await tags.get("workers"))!)).toEqual([
      "Post-A",
      "Post-B",
    ]);
    expect(JSON.parse((await tags.get("cloudflare"))!)).toEqual(["Post-A"]);

    await syncPostTags(tags, "Post-A", ["workers"], ["workers", "cloudflare"]);
    expect(await tags.get("cloudflare")).toBeNull();
    expect(JSON.parse((await tags.get("workers"))!)).toEqual([
      "Post-A",
      "Post-B",
    ]);
  });

  it("unindexes a post", async () => {
    const tags = new MemoryKV() as unknown as KVNamespace;
    await syncPostTags(tags, "Draft", ["x-y"], []);
    await unindexPost(tags, "Draft", ["x-y"]);
    expect(await tags.get("x-y")).toBeNull();
  });

  it("lists posts by tag and deletes tag from posts", async () => {
    const posts = new MemoryKV() as unknown as KVNamespace;
    const tags = new MemoryKV() as unknown as KVNamespace;

    await putPost(
      posts,
      "Sample",
      "---\nvisible: true\ntags: workers, go-lang\n---\n# Hello\n",
    );
    await putPost(
      posts,
      "Draft",
      "---\nvisible: false\ntags: workers\n---\n# Secret\n",
    );
    await syncPostTags(tags, "Sample", ["workers", "go-lang"], []);
    await syncPostTags(tags, "Draft", ["workers"], []);

    const publicList = await listPostsByTag(posts, tags, "workers");
    expect(publicList?.ongoing.map((p) => p.slug)).toEqual(["Sample"]);

    const all = await listPostsByTag(posts, tags, "workers", {
      includeHidden: true,
    });
    expect(all?.ongoing.map((p) => p.slug).sort()).toEqual(["Draft", "Sample"]);

    const del = await deleteTag(posts, tags, "workers");
    expect(del).toEqual({ ok: true, updatedPosts: 2 });
    expect(await tags.get("workers")).toBeNull();
    expect((await getPost(posts, "Sample"))?.frontmatter.tags).toEqual([
      "go-lang",
    ]);
    expect((await getPost(posts, "Draft"))?.frontmatter.tags).toEqual([]);
  });
});
