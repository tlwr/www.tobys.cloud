const PARTY_PATH = "/pensioen-feestje";

const PARTY_HTML = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pensioenfeestje</title>
    <style>
      :root {
        --dark: #2d2d2d;
        --light: #f2f0ec;
        --highlight: mediumseagreen;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --light: #2d2d2d;
          --dark: #f2f0ec;
        }
      }

      body {
        background-color: var(--light);
        color: var(--dark);
        font-family: sans-serif;
        font-size: 100%;
        line-height: 1.5;
        margin: 0;
      }

      h1 {
        font-size: 2rem;
        line-height: 1.25;
        margin-top: 1em;
        margin-bottom: 0.5em;
      }

      p {
        margin-top: 0;
        margin-bottom: 1rem;
      }

      .container {
        max-width: 40em;
        margin-left: auto;
        margin-right: auto;
        padding: 2rem;
      }
    </style>
  </head>
  <body>
    <main class="container">
      <h1>Pensioenfeestje</h1>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh elementum imperdiet.</p>
      <p>Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue semper porta. Mauris massa. Vestibulum lacinia arcu eget nulla. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos.</p>
    </main>
  </body>
</html>
`;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === "www.vink.club") {
      url.hostname = "vink.club";
      return Response.redirect(url.toString(), 301);
    }

    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === PARTY_PATH) {
      return new Response(PARTY_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("vink.club", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },
};
