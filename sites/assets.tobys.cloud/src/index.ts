export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    // Shared CSS/fonts are loaded cross-origin (e.g. pom.tobys.cloud).
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Long-lived cache for versioned-looking static assets; HTML is unlikely here.
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
