const baseTemplate = [`<!doctype html>
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
`, `
    </main>
`, `
  </body>
</html>`];

async function handle(request) {
    let rendered;

    if (request.method == "POST") {
        const form = await request.formData();

        let minutes;
        minutes = form.get("minutes");
        if (minutes == undefined) {
            minutes = "25";
        }
        minutes = parseInt(minutes, 10);
        if (isNaN(minutes)) {
            minutes = 25;
        }

        const now = new Date();
        const delta = 1000 * 60 * minutes;
        const finished = new Date(now.getTime() + delta);

        const u = new URL(request.url);
        const ru = `https://${u.host}/${finished.getTime()}`;

        return Response.redirect(ru, 302);
    } else {
        const u = new URL(request.url);

        if (/^[/]done/.test(u.pathname)) {
            rendered = String.raw({ raw: baseTemplate }, [`
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
            `,]);
        } else if (/^[/]\d+$/.test(u.pathname)) {
            const ts = parseInt(u.pathname.replace("/", ""), 10);
            const d = new Date(ts);

            const now = new Date();
            let delta = d.getTime() - now.getTime();
            if (delta < 0) delta = 0;
            delta = delta / 1000; // js ms html s
            delta = Math.floor(delta);

            rendered = String.raw({ raw: baseTemplate }, [`
            <template id="end-ts">
            ${d.getTime()}
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
            `,]);
        } else {
            rendered = String.raw({ raw: baseTemplate }, [`
                <form method="POST">
                <label for="minutes">Time (minutes)</label>
                <input type="number"
                    name="minutes"
                    value="25" min="5" max="60" step="5"/>
                <button id="start">start</button>
                </form>
            `,]);
        }
    }

    return new Response(rendered, {
    status: 200,
    headers: {
        'Content-Type': 'text/html',
    },
});
}

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});
