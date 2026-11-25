import { stylesheetLink } from "@tobys/ui";

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>404 Not Found</title>
    ${stylesheetLink()}
  </head>


  <body>
    <main class="container">
      <p class="term" aria-label="404 Not Found">
   __ __  ____  __ __     _   __      __     ______                      __
  / // / / __ \\/ // /    / | / /___  / /_   / ____/___  __  ______  ____/ /
 / // /_/ / / / // /_   /  |/ / __ \\/ __/  / /_  / __ \\/ / / / __ \\/ __  /
/__  __/ /_/ /__  __/  / /|  / /_/ / /_   / __/ / /_/ / /_/ / / / / /_/ /
  /_/  \\____/  /_/    /_/ |_/\\____/\\__/  /_/    \\____/\\__,_/_/ /_/\\__,_/
      </p>
    </main>

    <footer class="container">
      <a href="https://www.toby.codes">www.toby.codes</a>
    </footer>
  </body>
</html>
`;

export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response(NOT_FOUND_HTML, {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  },
};
