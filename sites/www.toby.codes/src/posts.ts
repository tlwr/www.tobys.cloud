import { parsePost, type ParsedPost } from "./frontmatter";
import { POSTS as BUNDLED_POSTS } from "./generated-posts";

export type PostMeta = {
  slug: string;
  title: string;
  date?: string;
  visible: boolean;
};

const DATE_RX = /^(2[0-9]{3}-[0-1][0-9])-(.*)$/;
export const SLUG_RX = /^[-_a-zA-Z0-9]+$/;
const INDEX_KEY = "posts:index";

type PostIndex = { posts: { slug: string; visible: boolean }[] };

/** Default body for new posts (draft until frontmatter is changed). */
export const NEW_POST_TEMPLATE = `---
visible: false
---

`;

export function isValidSlug(slug: string): boolean {
  return SLUG_RX.test(slug);
}

export function metaFromSlug(slug: string, visible = true): PostMeta {
  const matches = DATE_RX.exec(slug);
  if (!matches) {
    return { slug, title: slug.replace(/-/g, " "), visible };
  }
  return {
    slug,
    date: matches[1],
    title: matches[2].replace(/-/g, " "),
    visible,
  };
}

function sortLists(ongoing: PostMeta[], dated: PostMeta[]) {
  dated.sort((a, b) => (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0));
  ongoing.sort((a, b) => a.slug.localeCompare(b.slug));
}

function partition(metas: PostMeta[]): {
  ongoing: PostMeta[];
  dated: PostMeta[];
} {
  const ongoing: PostMeta[] = [];
  const dated: PostMeta[] = [];
  for (const meta of metas) {
    if (meta.date) {
      dated.push(meta);
    } else {
      ongoing.push(meta);
    }
  }
  sortLists(ongoing, dated);
  return { ongoing, dated };
}

async function listAllKvKeys(postsKv: KVNamespace): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await postsKv.list(cursor ? { cursor } : undefined);
    for (const key of page.keys) {
      if (SLUG_RX.test(key.name)) {
        slugs.push(key.name);
      }
    }
    if (page.list_complete) {
      break;
    }
    cursor = page.cursor;
  }

  return slugs;
}

async function loadRaw(
  postsKv: KVNamespace,
  slug: string,
): Promise<string | null> {
  if (!SLUG_RX.test(slug)) {
    return null;
  }
  const fromKv = await postsKv.get(slug);
  if (fromKv !== null) {
    return fromKv;
  }
  return BUNDLED_POSTS[slug] ?? null;
}

/**
 * Load full post document. Prefer POSTS KV; fall back to bundled generate-posts.
 */
export async function getPost(
  postsKv: KVNamespace,
  slug: string,
): Promise<ParsedPost | null> {
  const raw = await loadRaw(postsKv, slug);
  if (raw === null) {
    return null;
  }
  return parsePost(raw);
}

/** Markdown body only (frontmatter stripped) — for HTML and .md routes. */
export async function getPostBody(
  postsKv: KVNamespace,
  slug: string,
): Promise<string | null> {
  const post = await getPost(postsKv, slug);
  return post?.body ?? null;
}

async function readIndex(postsKv: KVNamespace): Promise<PostMeta[] | null> {
  const raw = await postsKv.get(INDEX_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PostIndex;
    if (!parsed || !Array.isArray(parsed.posts)) {
      return null;
    }
    return parsed.posts
      .filter((p) => p && SLUG_RX.test(p.slug))
      .map((p) => metaFromSlug(p.slug, p.visible !== false));
  } catch {
    return null;
  }
}

async function writeIndex(postsKv: KVNamespace, metas: PostMeta[]): Promise<void> {
  const posts = metas.map((m) => ({ slug: m.slug, visible: m.visible }));
  await postsKv.put(INDEX_KEY, JSON.stringify({ posts }));
}

/** One-time scan when `posts:index` is missing. Later lists are a single read. */
async function rebuildIndex(postsKv: KVNamespace): Promise<PostMeta[]> {
  const slugs = await listAllKvKeys(postsKv);
  const metas: PostMeta[] = [];
  for (const slug of slugs) {
    const raw = await postsKv.get(slug);
    if (raw === null) {
      continue;
    }
    const { frontmatter } = parsePost(raw);
    metas.push(metaFromSlug(slug, frontmatter.visible));
  }
  await writeIndex(postsKv, metas);
  return metas;
}

async function upsertIndex(
  postsKv: KVNamespace,
  slug: string,
  visible: boolean,
): Promise<void> {
  const current = (await readIndex(postsKv)) ?? (await rebuildIndex(postsKv));
  const next = current.filter((m) => m.slug !== slug);
  next.push(metaFromSlug(slug, visible));
  await writeIndex(postsKv, next);
}

async function removeFromIndex(postsKv: KVNamespace, slug: string): Promise<void> {
  const current = await readIndex(postsKv);
  if (!current) {
    return;
  }
  await writeIndex(
    postsKv,
    current.filter((m) => m.slug !== slug),
  );
}

/** Write full raw markdown (including frontmatter) for an existing or new slug. */
export async function putPost(
  postsKv: KVNamespace,
  slug: string,
  raw: string,
): Promise<void> {
  if (!SLUG_RX.test(slug)) {
    throw new Error("invalid slug");
  }
  await postsKv.put(slug, raw);
  const { frontmatter } = parsePost(raw);
  await upsertIndex(postsKv, slug, frontmatter.visible);
}

export type DeletePostResult =
  | { ok: true }
  | { ok: false; reason: "invalid_slug" | "not_found" | "visible" };

/**
 * Delete a post from KV. Only non-visible (draft) posts may be deleted.
 */
export async function deletePost(
  postsKv: KVNamespace,
  slug: string,
): Promise<DeletePostResult> {
  if (!SLUG_RX.test(slug)) {
    return { ok: false, reason: "invalid_slug" };
  }
  const post = await getPost(postsKv, slug);
  if (post === null) {
    return { ok: false, reason: "not_found" };
  }
  if (post.frontmatter.visible) {
    return { ok: false, reason: "visible" };
  }
  await postsKv.delete(slug);
  await removeFromIndex(postsKv, slug);
  return { ok: true };
}

/**
 * List posts. When `includeHidden` is false (public), drafts are omitted.
 * Uses `posts:index` (one read). Missing index is rebuilt once from the documents.
 * An empty KV with no index falls back to the bundled generate-posts snapshot.
 */
export async function listPosts(
  postsKv: KVNamespace,
  options: { includeHidden?: boolean } = {},
): Promise<{ ongoing: PostMeta[]; dated: PostMeta[] }> {
  const includeHidden = options.includeHidden === true;
  let metas = await readIndex(postsKv);
  if (!metas) {
    const kvSlugs = await listAllKvKeys(postsKv);
    if (kvSlugs.length === 0) {
      metas = Object.keys(BUNDLED_POSTS).map((slug) => {
        const { frontmatter } = parsePost(BUNDLED_POSTS[slug]);
        return metaFromSlug(slug, frontmatter.visible);
      });
    } else {
      metas = await rebuildIndex(postsKv);
    }
  }
  if (!includeHidden) {
    metas = metas.filter((m) => m.visible);
  }

  return partition(metas);
}
