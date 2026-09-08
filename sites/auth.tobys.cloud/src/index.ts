import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import bcrypt from "bcryptjs";
import {
  AUTH_CLIENTS,
  clearSession,
  getIdentity,
  getJwtSecret,
  handleCallback,
  hasPermission,
  isAuthClientId,
  originAllowed,
  redirectOriginAllowed,
  requireLocalAuth,
  requireLocalSession,
  setSessionCookie,
  signTicket,
  type AuthClientId,
  type AuthEnv,
} from "@tobys/auth-client";
import { auditMeta, listAudit, writeAudit } from "./audit";
import type { Env } from "./env";
import {
  auditHtml,
  forbiddenHtml,
  layout,
  loginHtml,
  meHtml,
  userEditHtml,
  userNewHtml,
  usersIndexHtml,
} from "./html";
import {
  countAuthAdmins,
  deleteUser,
  getUser,
  isValidEmail,
  listUsers,
  normalizeEmail,
  putUser,
  sanitizePermissions,
} from "./users";

export type { Env };

type Bindings = Env & AuthEnv;

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  csrf({
    origin: (origin, c) =>
      originAllowed("auth", origin, new URL(c.req.url).origin),
  }),
);

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string");
  }
  if (typeof v === "string" && v) {
    return [v];
  }
  return [];
}

async function page(
  c: Context<{ Bindings: Bindings }>,
  body: string,
  extra: { title?: string; notice?: string; alert?: string } = {},
) {
  const id = await getIdentity(c, "auth");
  return c.html(
    layout(body, {
      email: id?.sub,
      isAdmin: hasPermission(id, "auth:admin"),
      ...extra,
    }),
  );
}

function homePath(next: string): string {
  if (next === "/" || next === "") {
    return "/me";
  }
  return next;
}

/** Relative path on this host, or `/me` if missing/empty/unsafe. */
function safeLocalPath(raw: string | undefined | null): string {
  const n = (raw ?? "").trim();
  if (n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") && n !== "/") {
    return n;
  }
  return "/me";
}

function parseRedirect(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return null;
    }
    return u;
  } catch {
    return null;
  }
}

async function finishAuthorize(
  c: Context<{ Bindings: Bindings }>,
  email: string,
  client: AuthClientId,
  redirect: URL,
  next: string,
): Promise<Response> {
  const user = await getUser(c.env.USERS, email);
  if (!user) {
    clearSession(c);
    return c.html(layout(loginHtml({ error: "Unknown user" })), 401);
  }
  const perm = AUTH_CLIENTS[client].permission;
  if (!user.permissions.includes(perm)) {
    return c.html(layout(forbiddenHtml(), { email: user.email }), 403);
  }
  const secret = getJwtSecret(c);
  if (!secret) {
    return c.text("AUTH_JWT_SECRET is not set", 500);
  }
  const ticket = await signTicket(secret, user.email, client, user.permissions);
  const dest = new URL(redirect.toString());
  dest.searchParams.set("ticket", ticket);
  dest.searchParams.set("next", safeLocalPath(next));
  return c.redirect(dest.toString());
}

app.get("/health", (c) => c.text("healthy"));

app.get("/", requireLocalAuth(), async (c) => {
  const users = await listUsers(c.env.USERS);
  return page(c, usersIndexHtml(users));
});

app.get("/me", requireLocalSession(), async (c) => {
  const id = await getIdentity(c, "auth");
  if (!id) {
    return c.redirect("/login?next=%2Fme");
  }
  return page(c, meHtml({ email: id.sub, permissions: id.perms }), {
    title: "Me",
  });
});

app.get("/audit", requireLocalAuth(), async (c) => {
  try {
    const { events, nextCursor } = await listAudit(c.env.AUDIT, {
      cursor: c.req.query("cursor"),
    });
    return page(c, auditHtml(events, { nextCursor }), { title: "Audit" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("audit list failed", err);
    return page(c, `<h2>Audit log</h2><p class="err">${msg}</p>`, {
      title: "Audit",
    });
  }
});

app.get("/login", async (c) => {
  const next = safeLocalPath(c.req.query("next"));
  const client = c.req.query("client") ?? "";
  const redirect = c.req.query("redirect") ?? "";
  const id = await getIdentity(c, "auth");
  if (id) {
    if (isAuthClientId(client) && client !== "auth" && redirect) {
      return c.redirect(
        `/authorize?client=${encodeURIComponent(client)}&redirect=${encodeURIComponent(redirect)}&next=${encodeURIComponent(next)}`,
      );
    }
    return c.redirect(homePath(next));
  }
  return c.html(
    layout(
      loginHtml({
        next,
        client,
        redirect,
      }),
    ),
  );
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const email = normalizeEmail(asString(body.email));
  const password = asString(body.password);
  const next = safeLocalPath(asString(body.next));
  const client = asString(body.client);
  const redirect = asString(body.redirect);
  const show = (error: string, status: 401 | 500 = 401) =>
    c.html(layout(loginHtml({ next, client, redirect, error })), status);

  const secret = getJwtSecret(c);
  if (!secret) {
    return show("Server misconfigured (AUTH_JWT_SECRET)", 500);
  }
  const meta = auditMeta(c);
  const user = await getUser(c.env.USERS, email);
  if (!user || !password) {
    await writeAudit(c.env.AUDIT, {
      type: "login.failure",
      email,
      ...meta,
    });
    return show("Invalid credentials");
  }
  const ok = await bcrypt.compare(password, user.hashedPassword);
  if (!ok) {
    await writeAudit(c.env.AUDIT, {
      type: "login.failure",
      email,
      ...meta,
    });
    return show("Invalid credentials");
  }
  await writeAudit(c.env.AUDIT, {
    type: "login.success",
    email: user.email,
    ...meta,
  });
  await setSessionCookie(c, {
    sub: user.email,
    aud: "auth",
    perms: user.permissions,
    typ: "session",
    iat: 0,
    exp: 0,
  });
  if (isAuthClientId(client) && client !== "auth" && redirect) {
    const dest = parseRedirect(redirect);
    if (
      dest &&
      originAllowed(client, dest.origin, new URL(c.req.url).origin)
    ) {
      return finishAuthorize(c, user.email, client, dest, next);
    }
  }
  return c.redirect(homePath(next));
});

app.get("/auth/callback", (c) => handleCallback(c, "auth"));

app.get("/authorize", async (c) => {
  const clientRaw = c.req.query("client") ?? "";
  const redirectRaw = c.req.query("redirect") ?? "";
  const next = safeLocalPath(c.req.query("next"));

  // No app client (or client=auth without a callback) → log into this admin UI.
  const dest = parseRedirect(redirectRaw);
  const isAppAuthorize =
    isAuthClientId(clientRaw) &&
    clientRaw !== "auth" &&
    dest !== null &&
    dest.pathname === "/auth/callback";
  if (!isAppAuthorize) {
    const id = await getIdentity(c, "auth");
    if (id) {
      return c.redirect(homePath(next));
    }
    return c.redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!originAllowed(clientRaw, dest.origin, new URL(c.req.url).origin)) {
    return c.text("Redirect origin not allowed", 400);
  }
  const id = await getIdentity(c, "auth");
  if (!id) {
    const params = new URLSearchParams({
      client: clientRaw,
      redirect: dest.toString(),
      next,
    });
    return c.redirect(`/login?${params.toString()}`);
  }
  return finishAuthorize(c, id.sub, clientRaw, dest, next);
});

app.get("/logout", (c) => {
  clearSession(c);
  const redirect = c.req.query("redirect");
  const dest = redirect ? parseRedirect(redirect) : null;
  if (dest) {
    const allowed = redirectOriginAllowed(
      dest.origin,
      new URL(c.req.url).origin,
    );
    if (allowed) {
      return c.redirect(dest.toString());
    }
  }
  return c.redirect("/login");
});

app.post("/logout", async (c) => {
  const id = await getIdentity(c, "auth");
  if (id) {
    await writeAudit(c.env.AUDIT, {
      type: "logout",
      email: id.sub,
      ...auditMeta(c),
    });
  }
  clearSession(c);
  return c.redirect("/login");
});

app.get("/users/new", requireLocalAuth(), async (c) => {
  return page(c, userNewHtml(), { title: "New user" });
});

app.post("/users/new", requireLocalAuth(), async (c) => {
  const body = await c.req.parseBody({ all: true });
  const email = normalizeEmail(asString(body.email));
  const password = asString(body.password);
  const permissions = sanitizePermissions(asStringArray(body.permissions));
  if (!isValidEmail(email)) {
    return page(c, userNewHtml({ email, error: "Invalid email" }), {
      title: "New user",
    });
  }
  if (password.length < 8) {
    return page(c, userNewHtml({ email, error: "Password too short" }), {
      title: "New user",
    });
  }
  if (await getUser(c.env.USERS, email)) {
    return page(c, userNewHtml({ email, error: "User already exists" }), {
      title: "New user",
    });
  }
  await putUser(c.env.USERS, {
    email,
    hashedPassword: await bcrypt.hash(password, 10),
    permissions,
  });
  const actor = (await getIdentity(c, "auth"))?.sub ?? "";
  await writeAudit(c.env.AUDIT, {
    type: "user.create",
    email,
    actor,
    ...auditMeta(c),
  });
  return c.redirect("/");
});

app.get("/users/:email", requireLocalAuth(), async (c) => {
  const email = decodeURIComponent(c.req.param("email") ?? "");
  const user = await getUser(c.env.USERS, email);
  if (!user) {
    return page(c, "<h2>Not found</h2>", { title: "404" });
  }
  return page(c, userEditHtml(user), { title: user.email });
});

app.post("/users/:email/permissions", requireLocalAuth(), async (c) => {
  const email = decodeURIComponent(c.req.param("email") ?? "");
  const user = await getUser(c.env.USERS, email);
  if (!user) {
    return page(c, "<h2>Not found</h2>");
  }
  const body = await c.req.parseBody({ all: true });
  const permissions = sanitizePermissions(asStringArray(body.permissions));
  if (
    user.permissions.includes("auth:admin") &&
    !permissions.includes("auth:admin") &&
    (await countAuthAdmins(c.env.USERS)) <= 1
  ) {
    return page(
      c,
      userEditHtml(user, { error: "Cannot remove the last auth:admin" }),
      { title: user.email },
    );
  }
  await putUser(c.env.USERS, { ...user, permissions });
  if (user.permissions.join(",") !== permissions.join(",")) {
    await writeAudit(c.env.AUDIT, {
      type: "user.permissions",
      email: user.email,
      actor: (await getIdentity(c, "auth"))?.sub ?? "",
      detail: `${user.permissions.join(", ") || "—"} → ${permissions.join(", ") || "—"}`,
      ...auditMeta(c),
    });
  }
  return c.redirect(`/users/${encodeURIComponent(user.email)}`);
});

app.post("/users/:email/password", requireLocalAuth(), async (c) => {
  const email = decodeURIComponent(c.req.param("email") ?? "");
  const user = await getUser(c.env.USERS, email);
  if (!user) {
    return page(c, "<h2>Not found</h2>");
  }
  const body = await c.req.parseBody();
  const password = asString(body.password);
  if (password.length < 8) {
    return page(c, userEditHtml(user, { error: "Password too short" }), {
      title: user.email,
    });
  }
  await putUser(c.env.USERS, {
    ...user,
    hashedPassword: await bcrypt.hash(password, 10),
  });
  await writeAudit(c.env.AUDIT, {
    type: "user.password",
    email: user.email,
    actor: (await getIdentity(c, "auth"))?.sub ?? "",
    ...auditMeta(c),
  });
  return c.redirect(`/users/${encodeURIComponent(user.email)}`);
});

app.post("/users/:email/delete", requireLocalAuth(), async (c) => {
  const email = decodeURIComponent(c.req.param("email") ?? "");
  const user = await getUser(c.env.USERS, email);
  if (!user) {
    return page(c, "<h2>Not found</h2>");
  }
  if (
    user.permissions.includes("auth:admin") &&
    (await countAuthAdmins(c.env.USERS)) <= 1
  ) {
    return page(
      c,
      userEditHtml(user, { error: "Cannot delete the last auth:admin" }),
      { title: user.email },
    );
  }
  await deleteUser(c.env.USERS, email);
  await writeAudit(c.env.AUDIT, {
    type: "user.delete",
    email: user.email,
    actor: (await getIdentity(c, "auth"))?.sub ?? "",
    ...auditMeta(c),
  });
  return c.redirect("/");
});

app.notFound(async (c) => {
  const id = await getIdentity(c, "auth");
  return c.html(layout("<h2>Not found</h2>", { email: id?.sub }), 404);
});

export { app };

export default {
  async fetch(
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
