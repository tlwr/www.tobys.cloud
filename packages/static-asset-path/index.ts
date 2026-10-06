const STATIC_ASSET_EXTENSIONS = new Set([
  "css",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "js",
  "map",
  "otf",
  "pdf",
  "png",
  "stl",
  "svg",
  "ttf",
  "txt",
  "webp",
  "woff",
  "woff2",
]);

/**
 * True for a file we are willing to read from the ASSETS binding.
 * An outbound fetch of a scanner URL (/.env, *.php, /.git) is recorded as a
 * high-risk Workers Issue, so everything else must be answered without a fetch.
 * `exact` covers extensionless pages such as / and /404.html.
 */
export function isStaticAssetPath(
  pathname: string,
  exact: readonly string[] = [],
): boolean {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (exact.includes(path)) return true;
  if (!path.startsWith("/") || path.includes("\0") || path.includes("\\")) {
    return false;
  }
  const segments = path.split("/").slice(1);
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9._~-]+$/.test(segment),
    )
  ) {
    return false;
  }
  const base = segments[segments.length - 1] ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  return STATIC_ASSET_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
}
