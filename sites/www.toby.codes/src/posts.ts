import { POSTS } from "./generated-posts";

export type PostMeta = {
  slug: string;
  title: string;
  date?: string;
};

const DATE_RX = /^(2[0-9]{3}-[0-1][0-9])-(.*)$/;

function metaFromSlug(slug: string): PostMeta {
  const matches = DATE_RX.exec(slug);
  if (!matches) {
    return { slug, title: slug.replace(/-/g, " ") };
  }
  return {
    slug,
    date: matches[1],
    title: matches[2].replace(/-/g, " "),
  };
}

/**
 * File-backed posts today (bundled via generate-posts.mjs).
 * Later the editor can prefer KV/R2 while keeping these helpers.
 */
export function listPosts(): { ongoing: PostMeta[]; dated: PostMeta[] } {
  const ongoing: PostMeta[] = [];
  const dated: PostMeta[] = [];

  for (const slug of Object.keys(POSTS)) {
    const meta = metaFromSlug(slug);
    if (meta.date) {
      dated.push(meta);
    } else {
      ongoing.push(meta);
    }
  }

  // Lexicographic reverse keeps YYYY-MM-* newest-first (same as Go).
  dated.sort((a, b) => (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0));
  ongoing.sort((a, b) => a.slug.localeCompare(b.slug));

  return { ongoing, dated };
}

export function getPostMarkdown(slug: string): string | null {
  if (!/^[-_a-zA-Z0-9]+$/.test(slug)) {
    return null;
  }
  return POSTS[slug] ?? null;
}
