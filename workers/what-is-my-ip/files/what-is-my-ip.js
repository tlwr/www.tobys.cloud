if (typeof Response === "undefined") {
  const fetch = require("node-fetch");
  Response = fetch.Response;
}

async function handle(req) {
  let ip = "dev";
  let contentType = "text/plain";

  if (req.headers && req.headers.has("CF-Connecting-IP")) {
    ip = req.headers.get("CF-Connecting-IP");
  }

  body = ip;

  if (req.headers && req.headers.has("Accept")) {
    if (req.headers.get("Accept").indexOf("json") >= 0) {
      body = JSON.stringify({ip: ip});
      contentType = "application/json";
    }
  }

  return new Response(
    body,
    {
      status: 200,
      headers: {
        "Content-Type": contentType,
      }
    },
  );
}

if (typeof addEventListener !== "undefined") {
  addEventListener("fetch", event => event.respondWith(handle(event.request)));
}

if (typeof module !== "undefined") {
  module.exports = handle;
}
