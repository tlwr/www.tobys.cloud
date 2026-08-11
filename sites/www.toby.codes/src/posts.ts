import { parsePost, type ParsedPost } from "./frontmatter";
import { POSTS as BUNDLED_POSTS } from "./generated-posts";

export type PostMeta = {
  slug: string;
  title: string;
  date?: string;
  visible: boolean;
};

const DATE_RX = /^(2[0-9]{3}-[0-1][0-9])-(.*)$/;
const SLUG_RX = /^[-_a-zA-Z0-9]+$/;

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

/**
 * List posts. When `includeHidden` is false (public), drafts are omitted.
 * Requires reading each document to resolve frontmatter `visible`.
 */
export async function listPosts(
  postsKv: KVNamespace,
  options: { includeHidden?: boolean } = {},
): Promise<{ ongoing: PostMeta[]; dated: PostMeta[] }> {
  const includeHidden = options.includeHidden === true;
  const kvSlugs = await listAllKvKeys(postsKv);
  const slugs =
    kvSlugs.length > 0 ? kvSlugs : Object.keys(BUNDLED_POSTS);

  const metas: PostMeta[] = [];
  for (const slug of slugs) {
    const raw = await loadRaw(postsKv, slug);
    if (raw === null) {
      continue;
    }
    const { frontmatter } = parsePost(raw);
    if (!includeHidden && !frontmatter.visible) {
      continue;
    }
    metas.push(metaFromSlug(slug, frontmatter.visible));
  }

  return partition(metas);
}
