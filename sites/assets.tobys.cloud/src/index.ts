import { isStaticAssetPath } from "../../../packages/static-asset-path/index";

export interface Env {
  ASSETS: Fetcher;
  FONTS: R2Bucket;
}

/** Extensionless style guide. html is not a general asset extension. */
const STYLE_GUIDE = ["/v1", "/v1/", "/v1/index.html"];

function assetPath(pathname: string): string | null {
  if (!isStaticAssetPath(pathname, STYLE_GUIDE)) return null;
  if (pathname === "/v1" || pathname === "/v1/") return "/v1/index.html";
  return pathname;
}

/** R2 key for a webfont. The key matches the URL path under fonts/. */
function fontKey(pathname: string): string | null {
  const ext = pathname.slice(pathname.lastIndexOf(".") + 1).toLowerCase();
  if (ext !== "woff" && ext !== "woff2") return null;
  return pathname.slice(1);
}

function fontResponse(request: Request, object: R2ObjectBody): Response {
  const headers = new Headers();
  headers.set(
    "content-type",
    object.key.endsWith(".woff2") ? "font/woff2" : "font/woff",
  );
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("cache-control", "public, max-age=86400");
  if (typeof object.size === "number") {
    headers.set("content-length", String(object.size));
  }
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers,
  });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.search = "";
    url.hash = "";

    // run_worker_first is on, so hits and misses both reach here.
    // Fetching a scanner URL is a high-risk Workers Issue.
    const pathname = assetPath(url.pathname);
    if (!pathname) {
      return notFound();
    }
    url.pathname = pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "cache-control": "no-store",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return notFound();
    }

    const key = fontKey(pathname);
    if (key) {
      const object = await env.FONTS.get(key);
      if (!object) return notFound();
      return fontResponse(request, object);
    }

    const response = await env.ASSETS.fetch(
      new Request(url.toString(), {
        method: request.method === "HEAD" ? "HEAD" : "GET",
      }),
    );
    const headers = new Headers(response.headers);

    // Shared CSS/fonts are loaded cross-origin (e.g. pom.tobys.cloud).
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

    if (!headers.has("Cache-Control")) {
      headers.set("Cache-Control", "public, max-age=86400");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
