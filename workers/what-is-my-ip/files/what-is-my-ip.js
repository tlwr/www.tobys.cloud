addEventListener('fetch', function(event) {
  event.respondWith(async function(req) {
    let ip = "dev";
    let contentType = "text/plain";

    if (req.headers.has("CF-Connecting-IP")) {
      ip = req.headers.get("CF-Connecting-IP");
    }

    body = ip;

    if (req.headers.has("Accept")) {
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
  }(event.request))
});
