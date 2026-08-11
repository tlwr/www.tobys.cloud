export function layout(
  body: string,
  options?: { robots?: string; isLoggedIn?: boolean; wide?: boolean },
): string {
  const robots = options?.robots ?? "index, follow";
  const authNav = options?.isLoggedIn
    ? `\n          <a href="/admin">Admin</a>\n          <a href="/logout">Log out</a>`
    : "";
  // Public pages keep the shared 52em container; admin/editor use a wider shell.
  const containerAttr = options?.wide
    ? 'class="container" style="max-width: min(96rem, 96vw);"'
    : 'class="container"';
  return `<!DOCTYPE html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="${robots}">
    <link rel="stylesheet" href="https://assets.tobys.cloud/styles.css" type="text/css">
    <link rel="icon" href="https://assets.tobys.cloud/favicon.ico">
    <title>Toby Lorne</title>
  </head>

  <body>
    <div ${containerAttr}>
      <header>
        <h1>Toby Lorne</h1>
        <nav>
          <a href="/">About</a>
          <a href="/posts">Posts</a>
          <a href="/work">Work</a>${authNav}
        </nav>
      </header>
    </div>

    <div ${containerAttr}>
      ${body}
    </div>
  </body>
</html>`;
}

export const INDEX_HTML = `<main role="main" class="homepage">
  <h2>About</h2>
  <p>
    Toby Lorne is a software engineer who works on making systems and networks
    more reliable and efficient. Presently in the Netherlands at
    <a href="https://www.booking.com">Booking.com</a>.
  </p>
  <p>
    UK
    <a href="https://gds.blog.gov.uk/">Government Digital Service</a>
    and
    <a href="https://blogs.fcdo.gov.uk">Foreign, Commonwealth &amp; Development Office</a>
    alumnus.
    <br>
    Co-founded
    <a href="https://www.crunchbase.com/organization/macromeasures">Macromeasures</a>,
    acquired by
    <a href="https://www.crunchbase.com/organization/peekanalytics">StatSocial</a>
    in 2018.
  </p>

  <h2>Contact</h2>
  <ul class="no-bullet">
    <li>
      &#x1f4e7; <a href="mailto:toby@toby.codes">toby@toby.codes</a>
    </li>
    <li>
      &#128187; <a href="https://github.com/tlwr">github.com/tlwr</a>
    </li>
  </ul>

  <h2>Open source</h2>
  <ul class="no-bullet">
    <li><a href="https://github.com/tlwr/operator-tools">tlwr/operator-tools</a></li>
    <li><a href="https://github.com/tlwr/registry-tag-resource">tlwr/registry-tag-resource</a></li>
    <li><a href="https://github.com/tlwr/merge-mgr">tlwr/merge-mgr</a></li>
  </ul>

  <ul class="no-bullet">
    <li><a href="https://github.com/alphagov/terraform-provider-concourse">alphagov/terraform-provider-concourse</a></li>
    <li><a href="https://github.com/alphagov/router">alphagov/router</a></li>
    <li><a href="https://github.com/alphagov/router">alphagov/paas-cf</a></li>
  </ul>

  <ul class="no-bullet">
    <li><a href="https://github.com/gchq/cyberchef">gchq/cyberchef</a></li>
    <li><a href="https://github.com/concourse/concourse">concourse/concourse</a></li>
    <li><a href="https://github.com/cloudfoundry">cloudfoundry</a></li>
  </ul>

  <h2>Links</h2>
  <ul class="no-bullet">
    <li>🍅<a href="https://pom.tobys.cloud">pom</a></li>
    <li>🌐<a href="https://what-is-my-ip.tobys.cloud">what-is-my-ip</a></li>
    <li>9️⃣<a href="https://nines.tobys.cloud/99.9">nines (downtime calculator)</a></li>
    <li>🚐<a href="https://mischiefs.nl">mischiefs</a></li>
  </ul>
</main>`;

export const WORK_HTML = `<main role="main" class="homepage">
  <h2>Work</h2>
  <p>
    Work with me on individual projects/solutions.
    This is unrelated to my day job at
    <a href="https://www.booking.com">Booking.com</a>.
  </p>

  <section>
    <h3>Power measurement for smartmeter P4 ports</h3>
    <p>
      In the Netherlands, there is a standard for how power meters should
      expose usage information. This is the P4 port (RJ11) data which periodically sends
      datagrams via 115200 baud serial.
    </p>

    <p>
      In multiple homes I have built and installed a
      <a href="https://raspberrypi.org">Raspberry Pi</a> + wifi
      monitoring solution. Energy usage data is collected and stored in the
      cloud and viewable via <a href="https://grafana.org">Grafana</a>
      dashboards.
    </p>

    <figure>
      <img src="/images/work-grafana-power-usage.png" alt="Grafana dashboard panel energy usage"/>
      <figcaption>
        Grafana panel showing grid consumption (Net) versus grid delivery (Zon)
        over a week. In this home, grid delivery is measured directly from the smart meter.
      </figcaption>
    </figure>

    <figure>
      <img src="/images/work-grafana-power-usage-2.png" alt="grafana dashboard panel energy usage, version 2"/>
      <figcaption>
        Grafana panel showing grid consumption (stroomverbruik) versus energy
        generation (opwekking) over 6 hours. in this home, grid consumption is
        measured by the smart meter, but energy generation can be measured from
        the solar relay (enphase).
      </figcaption>
    </figure>

    <figure>
      <img src="/images/work-grafana-power-usage-3.png" alt="grafana dashboard panel energy usage, version 3, with battery"/>
      <figcaption>
        Grafana panel showing grid consumption (verbruik) versus energy
        generation (opwekking) over 24 hours. in this home, grid consumption is
        measured by the smart meter, but energy generation can be measured from
        the solar relay (enphase). In this iteration there is also 1 kWh
        battery (ecoflow) that is charged during the day.
      </figcaption>
    </figure>

    <p>
      The devices are available via
      <a href="https://tailscale.com">Tailscale</a>
      for metrics collection and device management.
    </p>
  </section>
</main>`;

export function postsListHtml(
  ongoing: { slug: string; title: string }[],
  dated: { slug: string; title: string; date?: string }[],
): string {
  const ongoingItems = ongoing
    .map(
      (p) =>
        `    <li itemprop="headline">
      <a href="/posts/${p.slug}">${escapeHtml(p.title)}</a>
    </li>`,
    )
    .join("\n");

  const datedItems = dated
    .map(
      (p) =>
        `    <li itemprop="headline">
      <span style="font-family: monospace;">${escapeHtml(p.date ?? "")}</span>
      <a href="/posts/${p.slug}">${escapeHtml(p.title)}</a>
    </li>`,
    )
    .join("\n");

  return `<main role="main" class="homepage">
  <h2>Posts</h2>

  <h3>Ongoing</h3>
  <ul class="no-bullet">
${ongoingItems}
  </ul>

  <h3>Posts</h3>
  <ul class="no-bullet">
${datedItems}
  </ul>
</main>`;
}

export function postHtml(slug: string, bodyHtml: string): string {
  const mdHref = `/posts/${encodeURIComponent(slug)}.md`;
  return `<main role="main" class="homepage">
  <p style="margin-top: 1.5rem; margin-bottom: 1.5rem;">
    <a href="${mdHref}">Read as markdown</a>
  </p>
${bodyHtml}
</main>`;
}

export function adminIndexHtml(): string {
  return `<main role="main" class="homepage">
  <h2>Admin</h2>
  <ul class="no-bullet">
    <li><a href="/admin/posts">Posts</a></li>
  </ul>
</main>`;
}

export function adminPostsHtml(
  ongoing: { slug: string; title: string; visible: boolean }[],
  dated: { slug: string; title: string; date?: string; visible: boolean }[],
): string {
  return `<main role="main" class="homepage">
  <p><a href="/admin">← Admin</a></p>
  <h2>Posts</h2>

  <h3>Dated</h3>
  ${adminPostsTable(dated, true)}

  <h3>Undated</h3>
  ${adminPostsTable(ongoing, false)}
</main>`;
}

function adminPostsTable(
  posts: { slug: string; title: string; date?: string; visible: boolean }[],
  showDate: boolean,
): string {
  if (posts.length === 0) {
    return `<p><em>None</em></p>`;
  }

  const header = showDate
    ? `<tr><th>Visible</th><th>Date</th><th>Title</th><th>Slug</th></tr>`
    : `<tr><th>Visible</th><th>Title</th><th>Slug</th></tr>`;

  const rows = posts
    .map((p) => {
      const visible = p.visible ? "🟢 on" : "🔴 off";
      const titleLink = `<a href="/posts/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a>`;
      const slugCell = `<code>${escapeHtml(p.slug)}</code>`;
      if (showDate) {
        return `<tr>
      <td>${visible}</td>
      <td><span style="font-family: monospace;">${escapeHtml(p.date ?? "")}</span></td>
      <td>${titleLink}</td>
      <td>${slugCell}</td>
    </tr>`;
      }
      return `<tr>
      <td>${visible}</td>
      <td>${titleLink}</td>
      <td>${slugCell}</td>
    </tr>`;
    })
    .join("\n");

  return `<table>
  <thead>
    ${header}
  </thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

/** Login form body — not linked from public nav. */
export function loginHtml(error?: string): string {
  const err = error
    ? `<p role="alert">${escapeHtml(error)}</p>`
    : "";
  return `<main role="main" class="homepage">
  <h2>Login</h2>
  ${err}
  <form method="post" action="/login">
    <p>
      <label for="username">Username</label><br>
      <input id="username" type="text" name="username" autocomplete="username" required>
    </p>
    <p>
      <label for="password">Password</label><br>
      <input id="password" type="password" name="password" autocomplete="current-password" required>
    </p>
    <p>
      <button type="submit">Log in</button>
    </p>
  </form>
</main>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
