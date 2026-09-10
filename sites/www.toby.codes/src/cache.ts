import type { Context } from "hono";

export const PUBLIC_CACHE_CONTROL =
  "public, max-age=600, stale-while-revalidate=86400";
export const PUBLIC_404_CACHE_CONTROL =
  "public, max-age=60, stale-while-revalidate=600";
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
    pathname === "/" ||
    pathname === "/work" ||
    pathname === "/robots.txt" ||
    pathname === "/posts"
  ) {
    return true;
  }
  if (pathname.startsWith("/posts-by-tag/")) {
    return true;
  }
  if (pathname.startsWith("/posts/")) {
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
  kind: "ok" | "notfound" = "ok",
): void {
  c.header(
    "Cache-Control",
    kind === "ok" ? PUBLIC_CACHE_CONTROL : PUBLIC_404_CACHE_CONTROL,
  );
  c.header("Cache-Tag", uniqueTags(["pages", ...tags]).join(","));
}

export async function purgePublic(c: Context, tags: string[]): Promise<void> {
  let invalidate: PublicEntrypoint["invalidate"] | undefined;
  try {
    invalidate = (c.executionCtx as GatewayExecutionCtx).exports?.Public
      ?.invalidate;
  } catch {
    // app.request() in tests has no ExecutionContext
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
