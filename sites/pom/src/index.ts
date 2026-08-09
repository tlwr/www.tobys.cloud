const baseTemplate = [
  `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://assets.tobys.cloud/styles.css" type="text/css">
    <link rel="icon" href="https://assets.tobys.cloud/favicon.ico">
    <title>pom.tobys.cloud</title>
  </head>

  <body>
    <div class="container">
      <header>
        <h1>🍅 pom</h1>
      </header>
    </div>

    <main class="container">
`,
  `
    </main>
`,
  `
  </body>
</html>`,
] as const;

function render(body: string): string {
  return baseTemplate[0] + body + baseTemplate[1] + baseTemplate[2];
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "POST") {
      const form = await request.formData();
      let minutes = parseInt(String(form.get("minutes") ?? "25"), 10);
      if (Number.isNaN(minutes)) {
        minutes = 25;
      }

      const finished = new Date(Date.now() + 1000 * 60 * minutes);
      const host = new URL(request.url).host;
      return Response.redirect(`https://${host}/${finished.getTime()}`, 302);
    }

    const pathname = new URL(request.url).pathname;
    let body: string;

    if (/^\/done/.test(pathname)) {
      body = `
            done

            <script type="text/javascript">
            Notification.requestPermission();
            new Notification(
                "🍅 pom",
                { body: "done" },
            );
            </script>

            <form action="/">
                <button>reset</button>
            </form>
            `;
    } else if (/^\/\d+$/.test(pathname)) {
      const ts = parseInt(pathname.replace("/", ""), 10);
      const end = new Date(ts);
      let delta = Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000));

      body = `
            <template id="end-ts">
            ${end.getTime()}
            </template>

            <meta http-equiv="refresh" content="${delta}; URL='/done" />

            <span id="mins"></span>m
            <span id="secs"></span>s

            <script type="text/javascript">
                Notification.requestPermission();

                const endTXT = document.querySelector("#end-ts");
                const endTS = parseInt(endTXT.innerHTML, 10);
                const end = new Date(endTS);

                const minsElem = document.querySelector("#mins");
                const secsElem = document.querySelector("#secs");

                setInterval(() => {
                    const now = new Date();
                    const delta = end.getTime() - now.getTime();

                    if (delta <= 0) {
                        alert("done");
                    }

                    let mins, secs;

                    secs = delta / 1000;
                    mins = Math.floor(secs / 60);
                    secs = Math.floor(secs % 60);

                    minsElem.innerText = mins;
                    secsElem.innerText = secs;
                }, 100);
            </script>

            <form action="/">
                <button>reset</button>
            </form>
            `;
    } else {
      body = `
                <form method="POST">
                <label for="minutes">Time (minutes)</label>
                <input type="number"
                    name="minutes"
                    value="25" min="5" max="60" step="5"/>
                <button id="start">start</button>
                </form>
            `;
    }

    return new Response(render(body), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
