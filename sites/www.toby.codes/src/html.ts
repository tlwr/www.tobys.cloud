export function layout(
  body: string,
  options?: {
    robots?: string;
    isLoggedIn?: boolean;
    wide?: boolean;
    htmx?: boolean;
  },
): string {
  const robots = options?.robots ?? "index, follow";
  // Admin tools sit on the right of the nav (action-bar style), separate from public links.
  const authNav = options?.isLoggedIn
    ? `
        <div class="site-nav-admin">
          <a href="/admin">Admin</a>
          <a href="/logout">Log out</a>
        </div>`
    : "";
  // Public pages keep the shared 52em container; admin/editor use a wider shell.
  const containerAttr = options?.wide
    ? 'class="container" style="max-width: min(96rem, 96vw);"'
    : 'class="container"';
  const htmxScript = options?.htmx
    ? `\n    <script src="https://cdnjs.cloudflare.com/ajax/libs/htmx/1.9.12/htmx.min.js" integrity="sha512-JvpjarJlOl4sW26MnEb3IdSAcGdeTeOaAlu2gUZtfFrRgnChdzELOZKl0mN6ZvI0X+xiX5UMvxjK2Rx2z/fliw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`
    : "";
  return `<!DOCTYPE html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="${robots}">
    <link rel="stylesheet" href="https://assets.tobys.cloud/styles.css" type="text/css">
    <link rel="icon" href="https://assets.tobys.cloud/favicon.ico">
    <title>Toby Lorne</title>
    <style>
      nav.site-nav {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1rem;
        justify-content: space-between;
      }
      .site-nav-primary,
      .site-nav-admin {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1rem;
      }
      .site-nav-admin {
        margin-left: auto;
      }
    </style>${htmxScript}
  </head>

  <body>
    <div ${containerAttr}>
      <header>
        <h1>Toby Lorne</h1>
        <nav class="site-nav">
          <div class="site-nav-primary">
            <a href="/">About</a>
            <a href="/posts">Posts</a>
            <a href="/work">Work</a>
          </div>${authNav}
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

const ADMIN_UI_STYLES = `
    .editor-toolbar {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 0.75rem 1rem;
      align-items: center;
      margin: 1rem 0;
    }
    .editor-toolbar-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      align-items: center;
      justify-content: flex-start;
    }
    .editor-toolbar-status {
      text-align: center;
      min-height: 1.5em;
    }
    .editor-toolbar-actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 0.75rem;
    }
    .editor-toolbar button:disabled {
      opacity: 0.6;
    }
    .editor-slug-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      align-items: center;
      margin: 0.5rem 0 1rem;
    }
    .editor-slug-row input[type="text"] {
      font-family: ui-monospace, "Berkeley Mono", monospace;
      font-size: 1rem;
      padding: 0.35rem 0.5rem;
      min-width: min(28rem, 100%);
      border: 1px solid var(--dark, #111);
      background: var(--light, #f2f0ec);
      color: var(--dark, #111);
    }
    .editor-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      height: calc(100vh - 16rem);
      min-height: 16rem;
    }
    .editor-split textarea,
    .editor-preview {
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
      border: 1px solid var(--dark, #111);
      padding: 0.75rem;
      margin: 0;
      background: var(--light, #f2f0ec);
      color: var(--dark, #111);
    }
    .editor-split textarea {
      width: 100%;
      resize: none;
      font-family: ui-monospace, "Berkeley Mono", monospace;
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .editor-preview { line-height: 1.5; }
    #save-status:empty { display: none; }
    @media (max-width: 52em) {
      .editor-toolbar {
        grid-template-columns: 1fr;
        justify-items: stretch;
      }
      .editor-toolbar-status,
      .editor-toolbar-actions {
        justify-content: flex-start;
        text-align: left;
      }
      .editor-split {
        grid-template-columns: 1fr;
        height: auto;
      }
      .editor-split textarea,
      .editor-preview {
        min-height: 40vh;
        height: 40vh;
      }
    }
`;

export function adminPostsHtml(
  ongoing: { slug: string; title: string; visible: boolean }[],
  dated: { slug: string; title: string; date?: string; visible: boolean }[],
): string {
  return `<main role="main" class="homepage">
  <style>${ADMIN_UI_STYLES}</style>
  <p><a href="/admin">← Admin</a></p>
  <h2>Posts</h2>

  <div class="editor-toolbar">
    <div class="editor-toolbar-links">
      <a href="/admin/posts/new">New post</a>
    </div>
    <div class="editor-toolbar-status"></div>
    <div class="editor-toolbar-actions"></div>
  </div>

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
      const safeSlug = escapeHtml(p.slug);
      const editHref = `/admin/posts/${safeSlug}/edit`;
      const titleLink = `<a href="${editHref}">${escapeHtml(p.title)}</a>`;
      const viewLink = `<a href="/posts/${safeSlug}">view</a>`;
      // Delete only for drafts — endpoint enforces the same rule.
      const deleteLink = p.visible
        ? ""
        : ` · ${deletePostForm(p.slug, "delete")}`;
      const slugCell = `<code>${safeSlug}</code>`;
      if (showDate) {
        return `<tr>
      <td>${visible}</td>
      <td><span style="font-family: monospace;">${escapeHtml(p.date ?? "")}</span></td>
      <td>${titleLink} · ${viewLink}${deleteLink}</td>
      <td>${slugCell}</td>
    </tr>`;
      }
      return `<tr>
      <td>${visible}</td>
      <td>${titleLink} · ${viewLink}${deleteLink}</td>
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

/** Inline delete form — only rendered for non-visible posts. */
function deletePostForm(slug: string, label = "Delete"): string {
  const safeSlug = escapeHtml(slug);
  return `<form method="post"
        action="/admin/posts/${safeSlug}/delete"
        style="display:inline"
        onsubmit="return confirm('Delete draft ${safeSlug}? This cannot be undone.');">
    <button type="submit">${escapeHtml(label)}</button>
  </form>`;
}

/** Split markdown / preview editor. `raw` includes frontmatter. */
export function adminPostEditHtml(
  slug: string,
  raw: string,
  options?: { canDelete?: boolean },
): string {
  const safeSlug = escapeHtml(slug);
  const safeRaw = escapeHtml(raw);
  // Delete form must sit outside the editor form (no nested forms).
  const deleteControl = options?.canDelete
    ? deletePostForm(slug, "Delete draft")
    : "";
  return `<main role="main" class="homepage">
  <style>${ADMIN_UI_STYLES}</style>

  <p><a href="/admin/posts">← Posts</a></p>
  <h2>Edit <code>${safeSlug}</code></h2>

  <div class="editor-toolbar">
    <div class="editor-toolbar-links">
      <a href="/posts/${safeSlug}" target="_blank" rel="noopener">Open public ↗</a>
      <a href="/posts/${safeSlug}.md" target="_blank" rel="noopener">Raw .md ↗</a>
      ${deleteControl}
    </div>
    <div class="editor-toolbar-status">
      <span id="save-status" aria-live="polite"></span>
    </div>
    <div class="editor-toolbar-actions">
      <button type="submit" id="save-btn" form="editor-form">Save</button>
    </div>
  </div>

  <form id="editor-form"
        hx-post="/admin/posts/${safeSlug}"
        hx-target="#save-status"
        hx-swap="innerHTML"
        hx-disabled-elt="#save-btn">
    <div class="editor-split">
      <label class="visually-hidden" for="markdown" style="position:absolute;left:-9999px">Markdown</label>
      <textarea id="markdown"
                name="markdown"
                spellcheck="false"
                hx-post="/admin/posts/preview"
                hx-trigger="input delay:250ms, load"
                hx-target="#preview"
                hx-include="this"
                hx-swap="innerHTML">${safeRaw}</textarea>
      <div id="preview" class="editor-preview" aria-live="polite"></div>
    </div>
  </form>

  ${editorClientScript()}
</main>`;
}

/** New post: slug field + editor, prefilled draft frontmatter. */
export function adminPostNewHtml(
  raw: string,
  options?: { slug?: string; error?: string },
): string {
  const safeRaw = escapeHtml(raw);
  const safeSlug = escapeHtml(options?.slug ?? "");
  const err = options?.error
    ? `<p role="alert">${escapeHtml(options.error)}</p>`
    : "";
  return `<main role="main" class="homepage">
  <style>${ADMIN_UI_STYLES}</style>

  <p><a href="/admin/posts">← Posts</a></p>
  <h2>New post</h2>
  ${err}

  <form id="editor-form"
        method="post"
        action="/admin/posts"
        hx-post="/admin/posts"
        hx-target="#save-status"
        hx-swap="innerHTML"
        hx-disabled-elt="#save-btn">
    <div class="editor-toolbar">
      <div class="editor-toolbar-links">
        <span style="opacity: 0.7;">Slug is permanent after create</span>
      </div>
      <div class="editor-toolbar-status">
        <span id="save-status" aria-live="polite"></span>
      </div>
      <div class="editor-toolbar-actions">
        <button type="submit" id="save-btn">Create</button>
      </div>
    </div>

    <div class="editor-slug-row">
      <label for="slug"><strong>Slug</strong></label>
      <input id="slug"
             type="text"
             name="slug"
             value="${safeSlug}"
             required
             pattern="[-_A-Za-z0-9]+"
             title="Letters, numbers, hyphens, and underscores only"
             autocomplete="off"
             spellcheck="false"
             placeholder="2026-08-My-post-title">
    </div>

    <div class="editor-split">
      <label class="visually-hidden" for="markdown" style="position:absolute;left:-9999px">Markdown</label>
      <textarea id="markdown"
                name="markdown"
                spellcheck="false"
                hx-post="/admin/posts/preview"
                hx-trigger="input delay:250ms, load"
                hx-target="#preview"
                hx-include="this"
                hx-swap="innerHTML">${safeRaw}</textarea>
      <div id="preview" class="editor-preview" aria-live="polite"></div>
    </div>
  </form>

  ${editorClientScript({ slugInput: true })}
</main>`;
}

function editorClientScript(
  options: { slugInput?: boolean } = {},
): string {
  const slugInput = options.slugInput === true;
  return `<script>
    (function () {
      var ta = document.getElementById("markdown");
      var form = document.getElementById("editor-form");
      var statusEl = document.getElementById("save-status");
      var slugEl = document.getElementById("slug");
      var dirty = false;
      var clearTimer = null;
      if (!ta || !form || !statusEl) return;

      function markDirty() { dirty = true; }
      ta.addEventListener("input", markDirty);
      if (slugEl) slugEl.addEventListener("input", markDirty);

      ${
        slugInput
          ? `
      if (slugEl) {
        slugEl.addEventListener("input", function () {
          var v = slugEl.value.trim();
          if (!v) {
            slugEl.setCustomValidity("Slug is required");
          } else if (!/^[-_A-Za-z0-9]+$/.test(v)) {
            slugEl.setCustomValidity("Letters, numbers, hyphens, and underscores only");
          } else {
            slugEl.setCustomValidity("");
          }
        });
      }
      `
          : ""
      }

      // Clear dirty on intentional submit so HX-Redirect / navigation does not
      // trip the beforeunload "leave site?" dialog. Restore if the request fails.
      form.addEventListener("submit", function () {
        dirty = false;
      });
      form.addEventListener("htmx:afterRequest", function (e) {
        if (e.detail.elt !== form) return;
        if (!e.detail.successful) {
          dirty = true;
          return;
        }
        dirty = false;
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(function () {
          statusEl.innerHTML = "";
          clearTimer = null;
        }, 5000);
      });
      window.addEventListener("beforeunload", function (e) {
        if (!dirty) return;
        e.preventDefault();
        e.returnValue = "";
      });
    })();
  </script>`;
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
