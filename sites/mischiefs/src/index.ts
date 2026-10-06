import { isStaticAssetPath } from "../../../packages/static-asset-path/index";

export interface Env {
  ASSETS: Fetcher;
}

const SITE_PAGES = ["/", "/index.html", "/404.html"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === "www.mischiefs.nl") {
      url.hostname = "mischiefs.nl";
      return Response.redirect(url.toString(), 301);
    }

    url.search = "";
    url.hash = "";
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      isStaticAssetPath(url.pathname, SITE_PAGES)
    ) {
      return env.ASSETS.fetch(
        new Request(url.toString(), {
          method: request.method === "HEAD" ? "HEAD" : "GET",
        }),
      );
    }

    // The designed 404 page, fetched by its own URL. Fetching the scanner
    // path itself is what Workers Issues calls a high-risk vulnerability scan.
    const page = await env.ASSETS.fetch(
      new URL("/404.html", url.origin).toString(),
    );
    const headers = new Headers(page.headers);
    headers.delete("etag");
    headers.delete("last-modified");
    headers.set("cache-control", "no-store");
    return new Response(page.body, { status: 404, headers });
  },
};
