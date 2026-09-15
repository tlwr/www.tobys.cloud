import type { Context } from "hono";

/** Aggressive edge TTL; writes purge tagged entries. */
export const PUBLIC_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";
export const PUBLIC_404_CACHE_CONTROL =
  "public, max-age=60, stale-while-revalidate=600";
export const IMAGE_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";
export const PRIVATE_NO_STORE = "private, no-store";

type ExecutionCache = {
  purge: (opts: { tags: string[] }) => Promise<unknown>;
};

export function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.filter((t) => t.length > 0))];
}

export function setPublicCache(
  c: Context,
  tags: string[],
  kind: "ok" | "notfound" | "image" = "ok",
): void {
  const control =
    kind === "image"
      ? IMAGE_CACHE_CONTROL
      : kind === "notfound"
        ? PUBLIC_404_CACHE_CONTROL
        : PUBLIC_CACHE_CONTROL;
  c.header("Cache-Control", control);
  c.header("Cache-Tag", uniqueTags(["pages", ...tags]).join(","));
}

export function pictureCacheTags(id: string, pictureTags: string[] = []): string[] {
  return uniqueTags([
    "pictures",
    `picture-${id}`,
    `image-${id}`,
    ...pictureTags.map((t) => `tag-${t}`),
  ]);
}

/** Private/admin/session responses must not be stored when default-entrypoint cache is on. */
export async function defaultPrivateCache(c: Context, next: () => Promise<void>) {
  await next();
  if (!c.res.headers.has("Cache-Control")) {
    c.res.headers.set("Cache-Control", PRIVATE_NO_STORE);
  }
}

export async function purgePublic(c: Context, tags: string[]): Promise<void> {
  const list = uniqueTags(tags);
  if (list.length === 0) {
    return;
  }
  let cache: ExecutionCache | undefined;
  try {
    cache = (c.executionCtx as ExecutionContext & { cache?: ExecutionCache })
      .cache;
  } catch {
    return;
  }
  if (!cache) {
    return;
  }
  await cache.purge({ tags: list });
}
