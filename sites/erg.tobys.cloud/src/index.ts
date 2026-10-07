import { handleMcp, protectedResourceMetadata, type Env } from "./mcp";

const HOME = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>erg.tobys.cloud</title>
</head>
<body>
  <h1>Concept2 logbook</h1>
  <p>Read-only MCP for one logbook. Connect an assistant to <code>https://erg.tobys.cloud/mcp</code>. Sign-in is auth.tobys.cloud, and the account needs the erg:read permission.</p>
</body>
</html>`;

function metadata(): Response {
  return Response.json(protectedResourceMetadata(), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname === "/.well-known/oauth-protected-resource" ||
      url.pathname === "/.well-known/oauth-protected-resource/mcp"
    ) {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
      return metadata();
    }
    if (url.pathname === "/mcp") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return handleMcp(request, env);
    }
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(HOME, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
