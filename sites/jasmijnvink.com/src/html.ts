import type { Picture } from "./pictures";
import type { TagRow } from "./tags";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layout(
  body: string,
  options: {
    isLoggedIn?: boolean;
    notice?: string;
    alert?: string;
    title?: string;
  } = {},
): string {
  const title = escapeHtml(options.title ?? "Jasmijn Vink");
  const authNav = options.isLoggedIn
    ? `          <span class="sep">|</span>
          <a href="/pictures/new" class="underline">uploaden</a>
          <span class="sep">|</span>
          <a href="/tags/new" class="underline">tag aanmaken</a>
          <span class="sep">|</span>
          <form method="post" action="/uitloggen">
            <button type="submit" class="linkish">uitloggen</button>
          </form>`
    : "";
  const flash = [
    options.notice
      ? `<p class="flash-ok">${escapeHtml(options.notice)}</p>`
      : "",
    options.alert
      ? `<p class="flash-err">${escapeHtml(options.alert)}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const flashSection = flash ? `<section>${flash}</section>` : "";

  return `<!DOCTYPE html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/styles.css">
    <link rel="icon" href="/favicon.png">
    <link rel="apple-touch-icon" href="/icon.png">
  </head>
  <body>
    <div class="container">
      <header class="site-title">Jasmijn Vink</header>
      <nav class="site-nav">
        <a href="/">home</a>
          <span class="sep">|</span>
        <a href="/pictures">alle beelden</a>
          <span class="sep">|</span>
        <a href="/tags">tags</a>
          <span class="sep">|</span>
        <a href="/random">random</a>
${authNav}
      </nav>
      ${flashSection}
      <main>
        ${body}
      </main>
    </div>
  </body>
</html>`;
}

function pictureCard(p: Picture, isLoggedIn: boolean): string {
  const hidden =
    isLoggedIn && !p.visible
      ? `<p class="hidden-label">Onzichtbaar</p>`
      : "";
  return `<div class="card item">
  <a href="/pictures/${escapeHtml(p.id)}">
    <img src="/pictures/${escapeHtml(p.id)}/image" alt="${escapeHtml(p.title)}">
  </a>
  <h3>${escapeHtml(p.title)}</h3>
  ${hidden}
</div>`;
}

export function homeHtml(pictures: Picture[], isLoggedIn: boolean): string {
  if (pictures.length === 0) {
    return `<p class="muted">Er zijn geen beelden</p>`;
  }
  return `<div class="grid-home">
${pictures.map((p) => pictureCard(p, isLoggedIn)).join("\n")}
</div>`;
}

export function picturesIndexHtml(
  pictures: Picture[],
  isLoggedIn: boolean,
): string {
  const list =
    pictures.length === 0
      ? `<p class="muted">Er zijn geen beelden</p>`
      : `<div class="picture-list">
${pictures.map((p) => pictureCard(p, isLoggedIn)).join("\n")}
</div>`;
  return `<h1>Alle beelden</h1>
${list}`;
}

export function pictureShowHtml(p: Picture, isLoggedIn: boolean): string {
  const tags =
    p.tags.length > 0
      ? `<p class="tags-inline muted">${p.tags
          .map(
            (t) =>
              `<a href="/tags/${escapeHtml(t)}">${escapeHtml(t)}</a>`,
          )
          .join("\n      ")}</p>`
      : "";
  const edit = isLoggedIn
    ? `<div class="edit-actions"><a href="/pictures/${escapeHtml(p.id)}/edit" class="underline">Bewerken</a></div>`
    : "";
  const desc = p.description
    ? `<p class="muted">${escapeHtml(p.description)}</p>`
    : "";
  return `<div class="show-image">
  <img src="/pictures/${escapeHtml(p.id)}/image" alt="${escapeHtml(p.title)}">
</div>
<h1>${escapeHtml(p.title)}</h1>
${desc}
${tags}
${edit}`;
}

function tagCheckboxes(allTags: string[], selected: string[]): string {
  if (allTags.length === 0) {
    return `<p class="muted">Geen tags. <a href="/tags/new">Tag aanmaken</a></p>`;
  }
  return allTags
    .map((t) => {
      const checked = selected.includes(t) ? " checked" : "";
      return `<div class="check">
        <input type="checkbox" name="tag_ids" value="${escapeHtml(t)}" id="tag-${escapeHtml(t)}"${checked}>
        <label for="tag-${escapeHtml(t)}">${escapeHtml(t)}</label>
      </div>`;
    })
    .join("\n");
}

function errorsBox(errors: string[]): string {
  if (errors.length === 0) {
    return "";
  }
  return `<div class="errors">
  <h3>Er zijn fouten opgetreden:</h3>
  <ul>
    ${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("\n    ")}
  </ul>
</div>`;
}

export function pictureNewHtml(
  allTags: string[],
  options: {
    title?: string;
    description?: string;
    visible?: boolean;
    tagIds?: string[];
    errors?: string[];
  } = {},
): string {
  const visible = options.visible !== false;
  return `<div class="form-card">
  <h2>Nieuwe afbeelding uploaden</h2>
  ${errorsBox(options.errors ?? [])}
  <form method="post" action="/pictures" enctype="multipart/form-data">
    <div class="row">
      <label for="title">Titel</label>
      <input id="title" type="text" name="title" required value="${escapeHtml(options.title ?? "")}">
    </div>
    <div class="row">
      <label for="description">Beschrijving</label>
      <textarea id="description" name="description">${escapeHtml(options.description ?? "")}</textarea>
    </div>
    <div class="row check">
      <input id="visible" type="checkbox" name="visible" value="1"${visible ? " checked" : ""}>
      <label for="visible">Zichtbaar</label>
    </div>
    <div class="row">
      <label>Tags</label>
      ${tagCheckboxes(allTags, options.tagIds ?? [])}
    </div>
    <div class="row">
      <label for="image">Afbeelding</label>
      <input id="image" type="file" name="image" accept="image/*" required>
    </div>
    <div class="row">
      <button type="submit" class="primary">Uploaden</button>
    </div>
  </form>
</div>`;
}

export function pictureEditHtml(
  p: Picture,
  allTags: string[],
  errors: string[] = [],
): string {
  return `<div class="form-card">
  <h2>Afbeelding bewerken</h2>
  ${errorsBox(errors)}
  <div class="edit-preview">
    <img src="/pictures/${escapeHtml(p.id)}/image" alt="${escapeHtml(p.title)}">
  </div>
  <form method="post" action="/pictures/${escapeHtml(p.id)}">
    <div class="row">
      <label for="title">Titel</label>
      <input id="title" type="text" name="title" required value="${escapeHtml(p.title)}">
    </div>
    <div class="row">
      <label for="description">Beschrijving</label>
      <textarea id="description" name="description">${escapeHtml(p.description)}</textarea>
    </div>
    <div class="row check">
      <input id="visible" type="checkbox" name="visible" value="1"${p.visible ? " checked" : ""}>
      <label for="visible">Zichtbaar</label>
    </div>
    <div class="row">
      <label>Tags</label>
      ${tagCheckboxes(allTags, p.tags)}
    </div>
    <div class="row">
      <button type="submit" class="primary">Bijwerken</button>
    </div>
  </form>
  <p><a href="/pictures/${escapeHtml(p.id)}">Annuleren</a></p>
  <div class="delete-box">
    <form method="post" action="/pictures/${escapeHtml(p.id)}/delete"
          onsubmit="return confirm('Weet je zeker dat je deze afbeelding wilt verwijderen?');">
      <button type="submit" class="danger">Verwijderen</button>
    </form>
  </div>
</div>`;
}

export function tagsIndexHtml(tags: TagRow[], isLoggedIn: boolean): string {
  if (tags.length === 0) {
    return `<h1>Tags</h1><p class="muted">Er zijn geen tags</p>`;
  }
  const items = tags
    .map((t) => {
      const del = isLoggedIn
        ? `<form method="post" action="/tags/${escapeHtml(t.tag)}/delete" onsubmit="return confirm('Are you sure?');">
            <button type="submit" class="danger-sm">Delete</button>
          </form>`
        : "";
      return `<li>
        <a href="/tags/${escapeHtml(t.tag)}">${escapeHtml(t.tag)} (${t.pictureIds.length})</a>
        ${del}
      </li>`;
    })
    .join("\n");
  return `<h1>Tags</h1>
<ul class="tag-list">
${items}
</ul>`;
}

export function tagShowHtml(
  tag: string,
  pictures: Picture[],
  isLoggedIn: boolean,
): string {
  const list =
    pictures.length === 0
      ? `<p class="muted">Er zijn geen beelden voor deze tag</p>`
      : `<div class="picture-list">
${pictures.map((p) => pictureCard(p, isLoggedIn)).join("\n")}
</div>`;
  return `<h1>${escapeHtml(tag)}</h1>
${list}`;
}

export function tagNewHtml(options: { id?: string; errors?: string[] } = {}): string {
  return `<div class="form-card">
  <h2>Tag aanmaken</h2>
  ${errorsBox(options.errors ?? [])}
  <form method="post" action="/tags">
    <div class="row">
      <label for="id">Tag naam</label>
      <input id="id" type="text" name="id" required pattern="[a-z0-9]+(-[a-z0-9]+)*"
             title="Alleen kleine letters, cijfers en streepjes toegestaan"
             value="${escapeHtml(options.id ?? "")}">
    </div>
    <div class="row">
      <button type="submit" class="primary">Aanmaken</button>
    </div>
  </form>
</div>`;
}

export function notFoundHtml(): string {
  return `<h1>404 NOT FOUND</h1>`;
}
