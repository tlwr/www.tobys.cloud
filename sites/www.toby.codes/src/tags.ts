import {
  isValidTag,
  normalizeTags,
  parsePost,
  rewriteFrontmatter,
} from "./frontmatter";
import { getPost, metaFromSlug, putPost, type PostMeta } from "./posts";

export type TagMeta = {
  tag: string;
  /** Post slugs that reference this tag (may include drafts). */
  slugs: string[];
};

function parseSlugList(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

async function listAllTagKeys(tagsKv: KVNamespace): Promise<string[]> {
  const tags: string[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await tagsKv.list(cursor ? { cursor } : undefined);
    for (const key of page.keys) {
      if (isValidTag(key.name)) {
        tags.push(key.name);
      }
    }
    if (page.list_complete) {
      break;
    }
    cursor = page.cursor;
  }

  return tags.sort((a, b) => a.localeCompare(b));
}

/** All tags (alphabetically), with slug membership. */
export async function listTags(tagsKv: KVNamespace): Promise<TagMeta[]> {
  const names = await listAllTagKeys(tagsKv);
  const out: TagMeta[] = [];
  for (const tag of names) {
    const slugs = parseSlugList(await tagsKv.get(tag));
    out.push({ tag, slugs });
  }
  return out;
}

/** Tag names only (sorted). */
export async function listTagNames(tagsKv: KVNamespace): Promise<string[]> {
  return listAllTagKeys(tagsKv);
}

async function writeTagSlugs(
  tagsKv: KVNamespace,
  tag: string,
  slugs: string[],
): Promise<void> {
  if (!isValidTag(tag)) {
    return;
  }
  const unique = [...new Set(slugs)].sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) {
    await tagsKv.delete(tag);
  } else {
    await tagsKv.put(tag, JSON.stringify(unique));
  }
}

/**
 * Update TAGS index for one post after create/save.
 * Adds/removes the slug on each tag membership change.
 * Empty tags are removed from the index.
 */
export async function syncPostTags(
  tagsKv: KVNamespace,
  slug: string,
  nextTags: string[],
  previousTags: string[] = [],
): Promise<void> {
  const next = new Set(normalizeTags(nextTags));
  const prev = new Set(normalizeTags(previousTags));

  const toAdd = [...next].filter((t) => !prev.has(t));
  const toRemove = [...prev].filter((t) => !next.has(t));

  for (const tag of toAdd) {
    const slugs = parseSlugList(await tagsKv.get(tag));
    if (!slugs.includes(slug)) {
      slugs.push(slug);
    }
    await writeTagSlugs(tagsKv, tag, slugs);
  }

  for (const tag of toRemove) {
    const slugs = parseSlugList(await tagsKv.get(tag)).filter((s) => s !== slug);
    await writeTagSlugs(tagsKv, tag, slugs);
  }
}

/** Drop a post from every tag it currently belongs to. */
export async function unindexPost(
  tagsKv: KVNamespace,
  slug: string,
  tags: string[],
): Promise<void> {
  await syncPostTags(tagsKv, slug, [], tags);
}

export type DeleteTagResult =
  | { ok: true; updatedPosts: number }
  | { ok: false; reason: "invalid_tag" | "not_found" };

/**
 * Delete a tag: strip it from all posts' frontmatter and remove the KV key.
 */
export async function deleteTag(
  postsKv: KVNamespace,
  tagsKv: KVNamespace,
  tag: string,
): Promise<DeleteTagResult> {
  if (!isValidTag(tag)) {
    return { ok: false, reason: "invalid_tag" };
  }

  const existing = await tagsKv.get(tag);
  if (existing === null) {
    // Also accept delete if key missing but validate shape
    const names = await listAllTagKeys(tagsKv);
    if (!names.includes(tag)) {
      return { ok: false, reason: "not_found" };
    }
  }

  const slugs = parseSlugList(existing);
  let updatedPosts = 0;

  for (const slug of slugs) {
    const post = await getPost(postsKv, slug);
    if (post === null) {
      continue;
    }
    if (!post.frontmatter.tags.includes(tag)) {
      continue;
    }
    const nextTags = post.frontmatter.tags.filter((t) => t !== tag);
    const nextRaw = rewriteFrontmatter(post.raw, { tags: nextTags });
    await putPost(postsKv, slug, nextRaw);
    updatedPosts++;
  }

  await tagsKv.delete(tag);
  return { ok: true, updatedPosts };
}

/**
 * Posts for a tag (public: visible only unless includeHidden).
 * Returns null if the tag does not exist in the index.
 */
export async function listPostsByTag(
  postsKv: KVNamespace,
  tagsKv: KVNamespace,
  tag: string,
  options: { includeHidden?: boolean } = {},
): Promise<{ tag: string; ongoing: PostMeta[]; dated: PostMeta[] } | null> {
  if (!isValidTag(tag)) {
    return null;
  }
  const raw = await tagsKv.get(tag);
  if (raw === null) {
    return null;
  }

  const includeHidden = options.includeHidden === true;
  const slugs = parseSlugList(raw);
  const ongoing: PostMeta[] = [];
  const dated: PostMeta[] = [];

  for (const slug of slugs) {
    const post = await getPost(postsKv, slug);
    if (post === null) {
      continue;
    }
    if (!includeHidden && !post.frontmatter.visible) {
      continue;
    }
    // Prefer frontmatter as source of truth; skip if tag removed but index stale
    if (!post.frontmatter.tags.includes(tag)) {
      continue;
    }
    const meta = metaFromSlug(slug, post.frontmatter.visible);
    if (meta.date) {
      dated.push(meta);
    } else {
      ongoing.push(meta);
    }
  }

  dated.sort((a, b) => (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0));
  ongoing.sort((a, b) => a.slug.localeCompare(b.slug));

  return { tag, ongoing, dated };
}
