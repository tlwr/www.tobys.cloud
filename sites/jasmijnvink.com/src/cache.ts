import type { Context } from "hono";

export const PUBLIC_CACHE_CONTROL =
  "public, max-age=600, stale-while-revalidate=86400";
export const PUBLIC_404_CACHE_CONTROL =
  "public, max-age=60, stale-while-revalidate=600";
export const IMAGE_CACHE_CONTROL =
  "public, max-age=86400, stale-while-revalidate=604800";
export const PRIVATE_NO_STORE = "private, no-store";

export type PublicEntrypoint = {
  fetch(request: Request): Promise<Response>;
  invalidate(args: { tags: string[] }): Promise<unknown>;
};

export type GatewayExecutionCtx = ExecutionContext & {
  exports?: {
    Public?: PublicEntrypoint;
  };
};

export function isPublicCacheablePath(pathname: string): boolean {
  if (
    pathname === "/tags/new" ||
    pathname === "/pictures/new" ||
    pathname.endsWith("/edit") ||
    pathname.endsWith("/preview")
  ) {
    return false;
  }
  if (pathname === "/" || pathname === "/pictures" || pathname === "/tags") {
    return true;
  }
  if (/^\/pictures\/\d+(\/image)?$/.test(pathname)) {
    return true;
  }
  if (/^\/tags\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) {
    return true;
  }
  return false;
}

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

export async function purgePublic(c: Context, tags: string[]): Promise<void> {
  let invalidate: PublicEntrypoint["invalidate"] | undefined;
  try {
    invalidate = (c.executionCtx as GatewayExecutionCtx).exports?.Public
      ?.invalidate;
  } catch {
    return;
  }
  if (typeof invalidate !== "function") {
    return;
  }
  const list = uniqueTags(tags);
  if (list.length === 0) {
    return;
  }
  await invalidate({ tags: list });
}
