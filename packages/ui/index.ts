/** Shared class names for https://assets.tobys.cloud/v1/toby.css */
export const STYLESHEET = "https://assets.tobys.cloud/v1/toby.css";

export const cls = {
  header: "site-header",
  nav: "nav",
  button: "btn",
  buttonPrimary: "btn btn-primary",
  flashOk: "flash flash-ok",
  flashError: "flash flash-error",
  flashLegend: "flash-legend",
  field: "field",
  table: "data",
  region: "region",
  viewport: "viewport",
  title: "title",
  shiftLeft: "shift shift-left",
  shiftRight: "shift shift-right",
} as const;

export function stylesheetLink(): string {
  return `<link rel="stylesheet" href="${STYLESHEET}">`;
}

/** messageHtml is inserted as HTML. Escape text first. */
export function flash(kind: "ok" | "error", messageHtml: string): string {
  const ok = kind === "ok";
  return `<div class="${ok ? cls.flashOk : cls.flashError}" role="${ok ? "status" : "alert"}"><span class="${cls.flashLegend}">${ok ? "OK" : "ERROR"}</span>${messageHtml}</div>`;
}

export function siteHeader(titleHtml: string, navHtml = ""): string {
  return `<header class="${cls.header}"><h1 class="${cls.title}">${titleHtml}</h1>${navHtml}</header>`;
}

export function nav(itemsHtml: string): string {
  return `<nav class="${cls.nav}">${itemsHtml}</nav>`;
}

export function button(
  labelHtml: string,
  opts: { primary?: boolean; type?: string } = {},
): string {
  const type = opts.type ?? "button";
  const klass = opts.primary ? cls.buttonPrimary : cls.button;
  return `<button class="${klass}" type="${type}">${labelHtml}</button>`;
}

export function field(opts: {
  id: string;
  name: string;
  label: string;
  type?: string;
  value?: string;
}): string {
  const type = opts.type ?? "text";
  const value = opts.value ? ` value="${opts.value}"` : "";
  return `<label for="${opts.id}">${opts.label}</label><input class="${cls.field}" id="${opts.id}" name="${opts.name}" type="${type}"${value}>`;
}

export function table(head: string[], rows: string[][]): string {
  const th = head.map((cell) => `<th>${cell}</th>`).join("");
  const body = rows
    .map(
      (row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table class="${cls.table}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

export function region(innerHtml: string): string {
  return `<div class="${cls.region}">${innerHtml}</div>`;
}

export function viewport(innerHtml: string): string {
  return `<div class="${cls.viewport}">${innerHtml}</div>`;
}
