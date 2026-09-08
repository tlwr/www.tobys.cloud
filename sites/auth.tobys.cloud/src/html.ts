import { ALL_PERMISSIONS, AUTH_CLIENTS } from "@tobys/auth-client";
import type { AuditEvent } from "./audit";
import type { User } from "./users";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layout(
  body: string,
  opts: {
    email?: string | null;
    isAdmin?: boolean;
    title?: string;
    notice?: string;
    alert?: string;
  } = {},
): string {
  const adminNav = opts.isAdmin
    ? `<a href="/">Users</a>
        <a href="/audit">Audit</a>
        <a href="/users/new">New user</a>`
    : "";
  const nav = opts.email
    ? `<nav>
        ${adminNav}
        <a href="/me">Me</a>
        <form method="post" action="/logout" style="display:inline">
          <button type="submit">Log out</button>
        </form>
        <span class="who">${escapeHtml(opts.email)}</span>
      </nav>`
    : `<nav></nav>`;
  const flash = [
    opts.notice ? `<p class="ok">${escapeHtml(opts.notice)}</p>` : "",
    opts.alert ? `<p class="err">${escapeHtml(opts.alert)}</p>` : "",
  ]
    .filter(Boolean)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(opts.title ?? "Auth")}</title>
  <style>
    :root { --dark: #111; --light: #f2f0ec; }
    @media (prefers-color-scheme: dark) {
      :root { --dark: #f2f0ec; --light: #111; }
    }
    body { font-family: ui-monospace, "Berkeley Mono", monospace; background: var(--light); color: var(--dark); margin: 0; line-height: 1.5; }
    .wrap { max-width: min(88rem, 96vw); margin: 0 auto; padding: 2rem 1rem; overflow-x: auto; }
    h1 { font-style: italic; text-transform: uppercase; }
    nav { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.5rem; }
    nav a, a { color: var(--dark); }
    nav .who { margin-left: auto; opacity: 0.7; }
    button, input, select { font: inherit; }
    button { background: var(--light); color: var(--dark); border: 2px solid var(--dark); border-radius: 5px; padding: 0.3rem 0.7rem; cursor: pointer; }
    button:hover { background: var(--dark); color: var(--light); }
    input[type=email], input[type=password], input[type=text] {
      width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--dark);
      background: var(--light); color: var(--dark);
    }
    .row { margin-bottom: 1rem; }
    .ok { background: #dcfce7; color: #166534; padding: 0.75rem; }
    .err { background: #fee2e2; color: #991b1b; padding: 0.75rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px dotted var(--dark); vertical-align: top; white-space: nowrap; }
    .checks label { display: block; margin: 0.25rem 0; }
    .muted { opacity: 0.7; }
    form.inline { display: inline; }
    .or { display: flex; align-items: center; gap: 0.75rem; margin: 1.25rem 0; opacity: 0.7; }
    .or::before, .or::after { content: ""; flex: 1; border-bottom: 1px dotted var(--dark); }
    .stack { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Auth</h1>
    ${nav}
    ${flash}
    ${body}
  </div>
</body>
</html>`;
}

export function loginHtml(opts: { next?: string; client?: string; redirect?: string; error?: string }): string {
  const err = opts.error ? `<p class="err">${escapeHtml(opts.error)}</p>` : "";
  const next = escapeHtml(opts.next ?? "/me");
  const client = escapeHtml(opts.client ?? "");
  const redirect = escapeHtml(opts.redirect ?? "");
  return `<h2>Log in</h2>
  ${err}
  <p id="passkey-error" class="err" hidden></p>
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${next}">
    <input type="hidden" name="client" value="${client}">
    <input type="hidden" name="redirect" value="${redirect}">
    <div class="row">
      <label for="email">Email</label>
      <input id="email" type="email" name="email" autocomplete="username webauthn" required>
    </div>
    <div class="row">
      <label for="password">Password</label>
      <input id="password" type="password" name="password" autocomplete="current-password" required>
    </div>
    <button type="submit">Log in</button>
  </form>
  <p class="or">or</p>
  <button type="button" id="passkey-login"
    data-next="${next}" data-client="${client}" data-redirect="${redirect}">
    Log in with a passkey
  </button>
  <script>
  (function () {
    var btn = document.getElementById("passkey-login");
    var err = document.getElementById("passkey-error");
    if (!btn) return;
    function show(msg) {
      if (!err) return;
      err.textContent = msg;
      err.hidden = false;
    }
    btn.addEventListener("click", async function () {
      if (!window.PublicKeyCredential || !PublicKeyCredential.parseRequestOptionsFromJSON) {
        show("Passkeys are not supported in this browser.");
        return;
      }
      btn.disabled = true;
      try {
        var optRes = await fetch("/login/passkey/options", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        });
        var optJson = await optRes.json();
        if (!optRes.ok) throw new Error(optJson.error || "Could not start passkey login");
        var cred = await navigator.credentials.get({
          publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(optJson.options)
        });
        if (!cred || typeof cred.toJSON !== "function") {
          throw new Error("Passkey login was cancelled");
        }
        var fin = await fetch("/login/passkey", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            credential: cred.toJSON(),
            next: btn.dataset.next || "/me",
            client: btn.dataset.client || "",
            redirect: btn.dataset.redirect || ""
          })
        });
        var body = await fin.json();
        if (!fin.ok || !body.ok) throw new Error(body.error || "Passkey login failed");
        location.href = body.redirect;
      } catch (e) {
        show(e && e.message ? e.message : "Passkey login failed");
        btn.disabled = false;
      }
    });
  })();
  </script>`;
}

function permChecks(selected: string[]): string {
  return ALL_PERMISSIONS.map((perm) => {
    const client = Object.values(AUTH_CLIENTS).find((cl) => cl.permission === perm);
    const checked = selected.includes(perm) ? " checked" : "";
    const label = client?.label ?? "";
    return `<label><input type="checkbox" name="permissions" value="${escapeHtml(perm)}"${checked}> ${escapeHtml(perm)} <span class="muted">(${escapeHtml(label)})</span></label>`;
  }).join("\n");
}

export function usersIndexHtml(users: User[]): string {
  const rows =
    users.length === 0
      ? `<tr><td colspan="2"><em>No users</em></td></tr>`
      : users
          .map((u) => {
            const href = `/users/${encodeURIComponent(u.email)}`;
            return `<tr>
      <td><a href="${href}">${escapeHtml(u.email)}</a></td>
      <td>${u.permissions.map(escapeHtml).join(", ") || "<span class=muted>none</span>"}</td>
    </tr>`;
          })
          .join("\n");
  return `<h2>Users</h2>
  <table>
    <thead><tr><th>Email</th><th>Permissions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function userNewHtml(opts: { email?: string; error?: string } = {}): string {
  const err = opts.error ? `<p class="err">${escapeHtml(opts.error)}</p>` : "";
  return `<h2>New user</h2>
  ${err}
  <form method="post" action="/users/new">
    <div class="row">
      <label for="email">Email</label>
      <input id="email" type="email" name="email" required value="${escapeHtml(opts.email ?? "")}">
    </div>
    <div class="row">
      <label for="password">Password</label>
      <input id="password" type="password" name="password" required minlength="8">
    </div>
    <div class="row checks">
      <p>Permissions</p>
      ${permChecks([])}
    </div>
    <button type="submit">Create</button>
  </form>`;
}

export function userEditHtml(user: User, opts: { error?: string } = {}): string {
  const err = opts.error ? `<p class="err">${escapeHtml(opts.error)}</p>` : "";
  const action = `/users/${encodeURIComponent(user.email)}`;
  return `<h2>${escapeHtml(user.email)}</h2>
  ${err}
  <form method="post" action="${action}/permissions">
    <div class="row checks">
      ${permChecks(user.permissions)}
    </div>
    <button type="submit">Save permissions</button>
  </form>
  <h3>Set password</h3>
  <form method="post" action="${action}/password">
    <div class="row">
      <input type="password" name="password" required minlength="8" placeholder="New password">
    </div>
    <button type="submit">Change password</button>
  </form>
  <h3>Delete</h3>
  <form method="post" action="${action}/delete" onsubmit="return confirm('Delete ${escapeHtml(user.email)}?');">
    <button type="submit">Delete user</button>
  </form>`;
}

export function meHtml(opts: {
  email: string;
  permissions: string[];
  hasPasskey?: boolean;
}): string {
  const perms =
    opts.permissions.length > 0
      ? opts.permissions.map(escapeHtml).join(", ")
      : "<span class=muted>none</span>";
  const passkeyBlock = opts.hasPasskey
    ? `<p>A passkey is registered on this account.</p>
  <div class="stack">
    <button type="button" id="passkey-register">Replace passkey</button>
    <form method="post" action="/passkeys/delete" onsubmit="return confirm('Remove your passkey? You can still log in with your password.');">
      <button type="submit">Remove passkey</button>
    </form>
  </div>`
    : `<p class="muted">No passkey registered. A passkey lets you sign in on this site with this device instead of a password.</p>
  <button type="button" id="passkey-register">Add passkey</button>`;
  return `<h2>Me</h2>
  <p><strong>Email</strong> ${escapeHtml(opts.email)}</p>
  <p><strong>Permissions</strong> ${perms}</p>
  <h3>Passkey</h3>
  <p id="passkey-status" hidden></p>
  ${passkeyBlock}
  <script>
  (function () {
    var btn = document.getElementById("passkey-register");
    var status = document.getElementById("passkey-status");
    if (!btn) return;
    function show(msg, ok) {
      if (!status) return;
      status.textContent = msg;
      status.className = ok ? "ok" : "err";
      status.hidden = false;
    }
    btn.addEventListener("click", async function () {
      if (!window.PublicKeyCredential || !PublicKeyCredential.parseCreationOptionsFromJSON) {
        show("Passkeys are not supported in this browser.");
        return;
      }
      btn.disabled = true;
      try {
        var optRes = await fetch("/passkeys/register/options", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        });
        var optJson = await optRes.json();
        if (!optRes.ok) throw new Error(optJson.error || "Could not start passkey registration");
        var cred = await navigator.credentials.create({
          publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(optJson.options)
        });
        if (!cred || typeof cred.toJSON !== "function") {
          throw new Error("Passkey registration was cancelled");
        }
        var fin = await fetch("/passkeys/register", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ credential: cred.toJSON() })
        });
        var body = await fin.json();
        if (!fin.ok || !body.ok) throw new Error(body.error || "Could not register passkey");
        location.reload();
      } catch (e) {
        show(e && e.message ? e.message : "Could not register passkey");
        btn.disabled = false;
      }
    });
  })();
  </script>`;
}

export function forbiddenHtml(): string {
  return `<h2>Forbidden</h2><p>You do not have permission to use this application.</p>`;
}

export function auditHtml(
  events: AuditEvent[],
  opts: { nextCursor?: string | null } = {},
): string {
  const rows =
    events.length === 0
      ? `<tr><td colspan="6"><em>No events</em></td></tr>`
      : events
          .map((e) => {
            const when = new Date(e.ts).toISOString().replace("T", " ").replace("Z", " UTC");
            return `<tr>
      <td>${escapeHtml(when)}</td>
      <td>${escapeHtml(e.type)}</td>
      <td>${escapeHtml(e.email || "—")}</td>
      <td>${escapeHtml(e.actor || "—")}</td>
      <td>${escapeHtml(e.detail || "—")}</td>
      <td class="muted">${escapeHtml(e.ip ?? "—")}</td>
    </tr>`;
          })
          .join("\n");
  const more = opts.nextCursor
    ? `<p><a href="/audit?cursor=${encodeURIComponent(opts.nextCursor)}">Older →</a></p>`
    : "";
  return `<h2>Audit log</h2>
  <table>
    <thead><tr><th>When</th><th>Event</th><th>Email</th><th>Actor</th><th>Detail</th><th>IP</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${more}`;
}
