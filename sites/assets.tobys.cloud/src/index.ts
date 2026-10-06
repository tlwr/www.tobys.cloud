import { isStaticAssetPath } from "../../../packages/static-asset-path/index";

export interface Env {
  ASSETS: Fetcher;
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

    // Existing files are usually served by the asset layer before this Worker.
    // Misses reach here. Fetching a scanner URL is a high-risk Workers Issue.
    if (!isStaticAssetPath(url.pathname)) {
      return notFound();
    }

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
