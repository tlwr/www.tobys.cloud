export default {
  async fetch(request: Request): Promise<Response> {
    const ip = request.headers.get("CF-Connecting-IP") ?? "dev";
    const accept = request.headers.get("Accept") ?? "";

    if (accept.includes("json")) {
      return Response.json({ ip });
    }

    return new Response(ip, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },
};
