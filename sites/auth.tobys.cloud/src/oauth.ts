import { getIdentity, hasPermission } from "@tobys/auth-client";
import type { Context } from "hono";
import { auditMeta, writeAudit } from "./audit";
import { escapeHtml, layout } from "./html";
import { getUser } from "./users";

const CLIENT_PREFIX = "oauth:client:";
const CODE_PREFIX = "oauth:code:";
const REFRESH_PREFIX = "oauth:refresh:";
const REFRESH_GRACE_PREFIX = "oauth:refresh-grace:";
const KEY_NAME = "oidc:signing-key";
const CODE_TTL_SEC = 120;
const TOKEN_TTL_SEC = 3600;
/** Connectors keep working across access-token expiry. The user signs in again after this. */
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
/**
 * A retry inside this window is given the same successor.
 * A later presentation of the old token revokes that successor.
 */
const REFRESH_REUSE_SEC = 120;
/** Audience an MCP client must request. Each resource needs its own permission. */
export const JVNL_MCP_RESOURCE = "https://jasmijnvink.com/mcp";
export const ERG_MCP_RESOURCE = "https://erg.tobys.cloud/mcp";

export const MCP_RESOURCES: Record<string, { permission: string; scope: string }> = {
  [JVNL_MCP_RESOURCE]: { permission: "jvnl:admin", scope: "jvnl" },
  [ERG_MCP_RESOURCE]: { permission: "erg:read", scope: "erg" },
};
const PUBLIC_CLIENT_HOSTS = new Set([
  "grok.com",
  "www.grok.com",
  "x.ai",
  "chatgpt.com",
  "openai.com",
  "platform.openai.com",
  "claude.ai",
  "claude.com",
]);

export type OAuthClient = {
  id: string;
  name: string;
  redirectUris: string[];
  secretHash: string;
  /** PKCE only. Grok and similar connectors send no client secret. */
  publicClient?: boolean;
  createdAt: string;
};

type AuthCode = {
  clientId: string;
  redirectUri: string;
  email: string;
  emailVerified: boolean;
  nonce: string;
  codeChallenge: string;
  resource: string;
  exp: number;
};

type RefreshRecord = {
  clientId: string;
  email: string;
  emailVerified: boolean;
  resource: string;
  exp: number;
  /** SHA-256 of the successor. Set when this token is rotated. */
  replacedBy?: string;
};

type Jwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  kty?: string;
};

type SigningKey = {
  kid: string;
  privateJwk: Jwk;
  publicJwk: Jwk;
};

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function b64urlBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlText(value: string): string {
  return b64urlBytes(new TextEncoder().encode(value));
}

function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64urlBytes(buf);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const DEFAULT_ISSUER = "https://auth.tobys.cloud";

export function issuerOf(envIssuer: string | undefined): string {
  const configured = (envIssuer || DEFAULT_ISSUER).replace(/\/$/, "");
  return configured;
}

export function oidcHostAllowed(requestUrl: string, issuer: string): boolean {
  const host = new URL(requestUrl).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }
  return host === new URL(issuer).hostname;
}

export function validRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.username || url.password || url.hash) {
      return false;
    }
    if (url.protocol === "https:") {
      return true;
    }
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function parseRedirectList(raw: string): string[] | null {
  const uris = raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (uris.length === 0 || uris.length > 10) {
    return null;
  }
  if (uris.some((uri) => !validRedirectUri(uri))) {
    return null;
  }
  return [...new Set(uris)];
}

type ResolvedClient = {
  id: string;
  name: string;
  redirectUris: string[];
  publicClient: boolean;
};

function publicClientRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      PUBLIC_CLIENT_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** ChatGPT's client id is an https URL on chatgpt.com. PKCE only, no stored secret. */
async function resolveCimd(clientId: string): Promise<ResolvedClient | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !PUBLIC_CLIENT_HOSTS.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    return null;
  }
  let response: Response;
  try {
    response = await fetch(url.toString(), { redirect: "manual" });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  let doc: {
    client_id?: unknown;
    client_name?: unknown;
    redirect_uris?: unknown;
    token_endpoint_auth_methods_supported?: unknown;
    token_endpoint_auth_method?: unknown;
  };
  try {
    doc = (await response.json()) as typeof doc;
  } catch {
    return null;
  }
  if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) {
    return null;
  }
  const methods = Array.isArray(doc.token_endpoint_auth_methods_supported)
    ? doc.token_endpoint_auth_methods_supported
    : [];
  if (!methods.includes("none") && doc.token_endpoint_auth_method !== "none") {
    return null;
  }
  const redirectUris = doc.redirect_uris.filter(
    (uri): uri is string => typeof uri === "string" && publicClientRedirect(uri),
  );
  if (redirectUris.length === 0) {
    return null;
  }
  return {
    id: clientId,
    name: typeof doc.client_name === "string" ? doc.client_name : "ChatGPT",
    redirectUris,
    publicClient: true,
  };
}

async function resolveClient(
  kv: KVNamespace,
  id: string,
): Promise<ResolvedClient | null> {
  if (id.startsWith("https://")) {
    return resolveCimd(id);
  }
  const client = await readClient(kv, id);
  if (!client) {
    return null;
  }
  return {
    id: client.id,
    name: client.name,
    redirectUris: client.redirectUris,
    publicClient: client.publicClient === true,
  };
}

async function readClient(kv: KVNamespace, id: string): Promise<OAuthClient | null> {
  if (!id || id.length > 80) {
    return null;
  }
  const raw = await kv.get(CLIENT_PREFIX + id);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as OAuthClient;
    if (!parsed?.id || !Array.isArray(parsed.redirectUris)) {
      return null;
    }
    if (!parsed.publicClient && !parsed.secretHash) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function listOAuthClients(kv: KVNamespace): Promise<OAuthClient[]> {
  const out: OAuthClient[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await kv.list(
      cursor ? { prefix: CLIENT_PREFIX, cursor } : { prefix: CLIENT_PREFIX },
    );
    for (const key of page.keys) {
      const client = await readClient(kv, key.name.slice(CLIENT_PREFIX.length));
      if (client) {
        out.push(client);
      }
    }
    if (page.list_complete) {
      break;
    }
    cursor = page.cursor;
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

const CLIENT_ID_RX = /^oc_[a-z0-9][a-z0-9_-]{0,62}$/;

export async function createOAuthClient(
  kv: KVNamespace,
  name: string,
  redirectRaw: string,
  publicClient = false,
  requestedId = "",
): Promise<{ client: OAuthClient; secret: string } | { error: string }> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { error: "Name must be 1–80 characters." };
  }
  const redirectUris = parseRedirectList(redirectRaw);
  if (!redirectUris) {
    return {
      error: "Add 1–10 redirect URIs. Use https, or http on localhost.",
    };
  }
  const wanted = requestedId.trim();
  let id: string;
  if (!wanted) {
    id = `oc_${randomId(12)}`;
  } else if (!CLIENT_ID_RX.test(wanted)) {
    return { error: "Client ID must look like oc_jasmijnvink." };
  } else if (await readClient(kv, wanted)) {
    return { error: "That client ID is already in use." };
  } else {
    id = wanted;
  }
  const secret = publicClient ? "" : randomId(32);
  const client: OAuthClient = {
    id,
    name: trimmed,
    redirectUris,
    secretHash: secret ? await sha256Hex(secret) : "",
    publicClient,
    createdAt: new Date().toISOString(),
  };
  await kv.put(CLIENT_PREFIX + client.id, JSON.stringify(client));
  return { client, secret };
}

export async function deleteOAuthClient(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(CLIENT_PREFIX + id);
}

function sameRedirects(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((uri, i) => uri === right[i]);
}

/** Grok registers again on each sign-in. The redirect set is the public client's identity. */
async function findPublicClient(
  kv: KVNamespace,
  redirectUris: string[],
): Promise<OAuthClient | null> {
  const matches = (await listOAuthClients(kv)).filter(
    (client) => client.publicClient === true && sameRedirects(client.redirectUris, redirectUris),
  );
  matches.sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  return matches[0] ?? null;
}

function registrationDocument(client: OAuthClient) {
  const issued = Date.parse(client.createdAt);
  return {
    client_id: client.id,
    client_id_issued_at: Number.isFinite(issued)
      ? Math.floor(issued / 1000)
      : Math.floor(Date.now() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none" as const,
  };
}

async function loadSigningKey(kv: KVNamespace): Promise<SigningKey> {
  const raw = await kv.get(KEY_NAME);
  if (raw) {
    return JSON.parse(raw) as SigningKey;
  }
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as Jwk;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
  const kid = (await sha256Hex(publicJwk.n ?? "")).slice(0, 16);
  const stored: SigningKey = { kid, privateJwk, publicJwk: { ...publicJwk, alg: "RS256", use: "sig", kid } };
  await kv.put(KEY_NAME, JSON.stringify(stored));
  return stored;
}

async function privateKey(stored: SigningKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    stored.privateJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signJwt(
  stored: SigningKey,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT", kid: stored.kid }));
  const body = b64urlText(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${header}.${body}`);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await privateKey(stored),
    data,
  );
  return `${header}.${body}.${b64urlBytes(new Uint8Array(sig))}`;
}

export async function verifyOidcJwt(
  token: string,
  publicJwk: Jwk,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = b64urlDecode(parts[2]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!ok) {
    return null;
  }
  const json = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as Record<
    string,
    unknown
  >;
  const exp = typeof json.exp === "number" ? json.exp : 0;
  if (exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return json;
}

async function pkceS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return b64urlBytes(new Uint8Array(digest));
}

type AuthorizeQuery = {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
};

function readAuthorize(source: {
  get(name: string): string | undefined;
}): AuthorizeQuery {
  return {
    clientId: source.get("client_id") ?? "",
    redirectUri: source.get("redirect_uri") ?? "",
    state: source.get("state") ?? "",
    nonce: source.get("nonce") ?? "",
    scope: source.get("scope") ?? "openid",
    codeChallenge: source.get("code_challenge") ?? "",
    codeChallengeMethod: source.get("code_challenge_method") ?? "",
    resource: source.get("resource") ?? "",
  };
}

const CHALLENGE_RX = /^[A-Za-z0-9_-]{43,128}$/;

function pkceAccept(query: AuthorizeQuery): boolean {
  return query.codeChallengeMethod === "S256" && CHALLENGE_RX.test(query.codeChallenge);
}

function issuerFor(c: Context): string {
  return issuerOf(c.env.AUTH_ISSUER as string | undefined);
}

function foreignHost(c: Context): Response | null {
  if (!oidcHostAllowed(c.req.url, issuerFor(c))) {
    return c.text("OIDC is only available on the issuer host", 400);
  }
  return null;
}

async function adminPage(c: Context, body: string, title: string): Promise<Response> {
  const id = await getIdentity(c, "auth");
  return c.html(
    layout(body, {
      email: id?.sub,
      isAdmin: hasPermission(id, "auth:admin"),
      title,
    }),
  );
}

function appsHtml(
  clients: OAuthClient[],
  issuer: string,
  createdApp?: { id: string; secret: string; publicClient?: boolean },
): string {
  const created = createdApp
    ? createdApp.publicClient
      ? `<p class="ok">This app uses PKCE only. Leave the client secret blank in the connector.</p>
       <p><strong>Client ID</strong> <code>${escapeHtml(createdApp.id)}</code></p>`
      : `<p class="ok">Copy the client secret now. It will not be shown again.</p>
       <p><strong>Client ID</strong> <code>${escapeHtml(createdApp.id)}</code></p>
       <p><strong>Client secret</strong> <code>${escapeHtml(createdApp.secret)}</code></p>`
    : "";
  const rows = clients
    .map(
      (client) => `<tr>
        <td><code>${escapeHtml(client.id)}</code></td>
        <td>${escapeHtml(client.name)}</td>
        <td>${client.redirectUris.map(escapeHtml).join("<br>")}</td>
        <td>
          <form method="post" action="/oauth/apps/${escapeHtml(client.id)}/delete">
            <button type="submit">Delete</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");
  return `<h2>OAuth apps</h2>
  <p class="muted">Third parties use this issuer for OpenID Connect. Authorization code plus PKCE S256. A PKCE-only app has no client secret. Other apps must send the secret as well. Registering the same redirect URIs again returns the existing PKCE app.</p>
  <p><strong>Issuer</strong> <code>${escapeHtml(issuer)}</code></p>
  <p><strong>Discovery</strong> <code>${escapeHtml(issuer)}/.well-known/openid-configuration</code></p>
  ${created}
  <table>
    <thead><tr><th>Client ID</th><th>Name</th><th>Redirect URIs</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="muted">No apps yet.</td></tr>`}</tbody>
  </table>
  <h3>New app</h3>
  <form method="post" action="/oauth/apps">
    <div class="row">
      <label for="name">Name</label>
      <input id="name" name="name" type="text" required>
    </div>
    <div class="row">
      <label for="client_id">Client ID</label>
      <input id="client_id" name="client_id" type="text" placeholder="oc_jasmijnvink">
    </div>
    <div class="row">
      <label for="redirect_uris">Redirect URIs</label>
      <input id="redirect_uris" name="redirect_uris" type="text" required placeholder="https://example.com/callback">
    </div>
    <div class="row">
      <label><input type="checkbox" name="public" value="1"> PKCE only, no client secret</label>
    </div>
    <button type="submit">Create app</button>
  </form>`;
}

function consentHtml(
  client: { name: string },
  query: AuthorizeQuery,
  email: string,
): string {
  const hidden = (
    [
      ["client_id", query.clientId],
      ["redirect_uri", query.redirectUri],
      ["state", query.state],
      ["nonce", query.nonce],
      ["scope", query.scope],
      ["code_challenge", query.codeChallenge],
      ["code_challenge_method", query.codeChallengeMethod],
      ["resource", query.resource],
      ["response_type", "code"],
    ] as const
  )
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`,
    )
    .join("");
  return `<h2>Authorize ${escapeHtml(client.name)}</h2>
  <p><strong>${escapeHtml(email)}</strong> will be shared with this app, along with your permissions.</p>
  <form method="post" action="/oauth/authorize">
    ${hidden}
    <button type="submit">Allow</button>
  </form>`;
}

export async function oauthDiscovery(c: Context): Promise<Response> {
  const blocked = foreignHost(c);
  if (blocked) {
    return blocked;
  }
  const issuer = issuerFor(c);
  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: [
      "openid",
      "email",
      "profile",
      ...Object.values(MCP_RESOURCES).map((resource) => resource.scope),
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
    code_challenge_methods_supported: ["S256"],
    claims_supported: ["sub", "email", "email_verified"],
  });
}

export async function oauthJwks(c: Context): Promise<Response> {
  const blocked = foreignHost(c);
  if (blocked) {
    return blocked;
  }
  const stored = await loadSigningKey(c.env.USERS);
  const { kty, n, e, alg, use, kid } = stored.publicJwk;
  return c.json({ keys: [{ kty, n, e, alg, use, kid }] });
}

export async function oauthRegister(c: Context): Promise<Response> {
  const blocked = foreignHost(c);
  if (blocked) {
    return blocked;
  }
  let body: {
    redirect_uris?: unknown;
    client_name?: unknown;
    token_endpoint_auth_method?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid_client_metadata" }, 400);
  }
  const redirects = Array.isArray(body.redirect_uris)
    ? [
        ...new Set(
          body.redirect_uris.filter((uri): uri is string => typeof uri === "string"),
        ),
      ]
    : [];
  if (
    redirects.length === 0 ||
    redirects.length > 10 ||
    redirects.some((uri) => !publicClientRedirect(uri))
  ) {
    return c.json({ error: "invalid_redirect_uri" }, 400);
  }
  const method =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "none";
  if (method !== "none") {
    return c.json(
      {
        error: "invalid_client_metadata",
        error_description: "Only PKCE (token_endpoint_auth_method none) is accepted.",
      },
      400,
    );
  }
  const existing = await findPublicClient(c.env.USERS, redirects);
  if (existing) {
    return c.json(registrationDocument(existing), 200);
  }
  const name =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 80)
      : "MCP client";
  const created = await createOAuthClient(
    c.env.USERS,
    name,
    redirects.join(" "),
    true,
  );
  if ("error" in created) {
    return c.json({ error: "invalid_client_metadata", error_description: created.error }, 400);
  }
  return c.json(registrationDocument(created.client), 201);
}

export async function oauthAppsGet(c: Context): Promise<Response> {
  const clients = await listOAuthClients(c.env.USERS);
  return adminPage(c, appsHtml(clients, issuerFor(c)), "OAuth apps");
}

export async function oauthAppsPost(c: Context): Promise<Response> {
  const body = await c.req.parseBody();
  const created = await createOAuthClient(
    c.env.USERS,
    typeof body.name === "string" ? body.name : "",
    typeof body.redirect_uris === "string" ? body.redirect_uris : "",
    body.public === "1",
    typeof body.client_id === "string" ? body.client_id : "",
  );
  const id = await getIdentity(c, "auth");
  if ("error" in created) {
    const clients = await listOAuthClients(c.env.USERS);
    return c.html(
      layout(
        `<p class="err">${escapeHtml(created.error)}</p>${appsHtml(clients, issuerFor(c))}`,
        { email: id?.sub, isAdmin: true, title: "OAuth apps" },
      ),
      400,
    );
  }
  await writeAudit(c.env.AUDIT, {
    type: "oauth.client.create",
    email: created.client.id,
    actor: id?.sub ?? null,
    detail: created.client.name,
    ...auditMeta(c),
  });
  const clients = await listOAuthClients(c.env.USERS);
  return adminPage(
    c,
    appsHtml(clients, issuerFor(c), {
      id: created.client.id,
      secret: created.secret,
      publicClient: created.client.publicClient === true,
    }),
    "OAuth apps",
  );
}

export async function oauthAppsDelete(c: Context): Promise<Response> {
  const clientId = c.req.param("id") ?? "";
  const id = await getIdentity(c, "auth");
  await deleteOAuthClient(c.env.USERS, clientId);
  await writeAudit(c.env.AUDIT, {
    type: "oauth.client.delete",
    email: clientId,
    actor: id?.sub ?? null,
    ...auditMeta(c),
  });
  return c.redirect("/oauth/apps");
}

async function denyAuthorize(
  c: Context,
  query: AuthorizeQuery,
  error: string,
): Promise<Response> {
  const client = await readClient(c.env.USERS, query.clientId);
  if (!client || !client.redirectUris.includes(query.redirectUri)) {
    return c.text(error, 400);
  }
  const dest = new URL(query.redirectUri);
  dest.searchParams.set("error", error);
  dest.searchParams.set("iss", issuerFor(c));
  if (query.state) {
    dest.searchParams.set("state", query.state);
  }
  return browserRedirect(c, dest.toString());
}

/** A 302 after the consent form is blocked by form-action 'self'. Navigate instead. */
function browserRedirect(c: Context, dest: string): Response {
  const href = escapeHtml(dest);
  c.header("Cache-Control", "no-store");
  return c.html(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${href}"><title>Redirecting</title></head><body><p><a href="${href}">Continue</a></p></body></html>`,
  );
}

function resourceAllowed(resource: string, permissions: string[]): boolean {
  if (!resource) {
    return true;
  }
  const mcp = MCP_RESOURCES[resource];
  return mcp !== undefined && permissions.includes(mcp.permission);
}

function tokenScope(resource: string, plain: string): string {
  const mcp = MCP_RESOURCES[resource];
  return mcp ? `openid email ${mcp.scope}` : plain;
}

export async function oauthAuthorizeGet(c: Context): Promise<Response> {
  const blocked = foreignHost(c);
  if (blocked) {
    return blocked;
  }
  const query = readAuthorize({ get: (name) => c.req.query(name) });
  if (!pkceAccept(query)) {
    return denyAuthorize(c, query, "invalid_request");
  }
  if (query.resource && !MCP_RESOURCES[query.resource]) {
    return denyAuthorize(c, query, "invalid_target");
  }
  const client = await resolveClient(c.env.USERS, query.clientId);
  if (!client || !client.redirectUris.includes(query.redirectUri)) {
    return c.text(
      `Unknown client or redirect URI. client_id=${query.clientId.slice(0, 200)} redirect_uri=${query.redirectUri.slice(0, 300)}`,
      400,
    );
  }
  if (!query.scope.split(" ").includes("openid")) {
    return denyAuthorize(c, query, "invalid_scope");
  }
  const session = await getIdentity(c, "auth");
  if (!session) {
    const next = new URL(c.req.url).pathname + new URL(c.req.url).search;
    return c.redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!resourceAllowed(query.resource, session.perms)) {
    return denyAuthorize(c, query, "access_denied");
  }
  return adminPage(c, consentHtml(client, query, session.sub), "Authorize");
}

export async function oauthAuthorizePost(c: Context): Promise<Response> {
  const blocked = foreignHost(c);
  if (blocked) {
    return blocked;
  }
  const body = await c.req.parseBody();
  const query = readAuthorize({
    get: (name) => {
      const value = body[name];
      return typeof value === "string" ? value : undefined;
    },
  });
  const session = await getIdentity(c, "auth");
  if (!session) {
    return c.redirect("/login?next=%2Foauth%2Fapps");
  }
  const client = await resolveClient(c.env.USERS, query.clientId);
  if (!client || !client.redirectUris.includes(query.redirectUri)) {
    return c.text(
      `Unknown client or redirect URI. client_id=${query.clientId.slice(0, 200)} redirect_uri=${query.redirectUri.slice(0, 300)}`,
      400,
    );
  }
  if (!pkceAccept(query)) {
    return denyAuthorize(c, query, "invalid_request");
  }
  if (query.resource && !MCP_RESOURCES[query.resource]) {
    return denyAuthorize(c, query, "invalid_target");
  }
  const user = await getUser(c.env.USERS, session.sub);
  if (!user) {
    return c.redirect("/login?next=%2Fme");
  }
  if (!resourceAllowed(query.resource, user.permissions)) {
    return denyAuthorize(c, query, "access_denied");
  }
  const code = randomId(32);
  const record: AuthCode = {
    clientId: client.id,
    redirectUri: query.redirectUri,
    email: user.email,
    emailVerified: session.amr?.includes("passkey") === true,
    nonce: query.nonce,
    codeChallenge: query.codeChallenge,
    resource: query.resource,
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SEC,
  };
  await c.env.USERS.put(CODE_PREFIX + code, JSON.stringify(record), {
    expirationTtl: CODE_TTL_SEC,
  });
  await writeAudit(c.env.AUDIT, {
    type: "oauth.authorize",
    email: user.email,
    actor: user.email,
    detail: client.id,
    ...auditMeta(c),
  });
  const dest = new URL(query.redirectUri);
  dest.searchParams.set("code", code);
  dest.searchParams.set("iss", issuerFor(c));
  if (query.state) {
    dest.searchParams.set("state", query.state);
  }
  return browserRedirect(c, dest.toString());
}

function tokenError(c: Context, error: string, status: 400 | 401 = 400): Response {
  return c.json({ error }, status);
}

async function issueRefreshToken(
  kv: KVNamespace,
  fields: Omit<RefreshRecord, "exp" | "replacedBy">,
): Promise<string> {
  const token = randomId(32);
  const exp = Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;
  const record: RefreshRecord = { ...fields, exp };
  await kv.put(REFRESH_PREFIX + (await sha256Hex(token)), JSON.stringify(record), {
    expirationTtl: REFRESH_TTL_SEC,
  });
  return token;
}

async function revokeRefreshChain(kv: KVNamespace, hash: string): Promise<void> {
  let current: string | undefined = hash;
  for (let i = 0; i < 8 && current; i++) {
    const raw: string | null = await kv.get(REFRESH_PREFIX + current);
    await kv.delete(REFRESH_PREFIX + current);
    await kv.delete(REFRESH_GRACE_PREFIX + current);
    if (!raw) {
      return;
    }
    try {
      current = (JSON.parse(raw) as RefreshRecord).replacedBy;
    } catch {
      return;
    }
  }
}

async function refreshStillAllowed(kv: KVNamespace, record: RefreshRecord): Promise<boolean> {
  const user = await getUser(kv, record.email);
  return user !== null && resourceAllowed(record.resource, user.permissions);
}

async function mintedTokens(
  c: Context,
  client: ResolvedClient,
  email: string,
  emailVerified: boolean,
  resource: string,
  nonce: string,
  refreshToken: string,
): Promise<Response> {
  const stored = await loadSigningKey(c.env.USERS);
  const now = Math.floor(Date.now() / 1000);
  const issuer = issuerFor(c);
  const idToken = await signJwt(stored, {
    iss: issuer,
    sub: email,
    aud: client.id,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
    email,
    email_verified: emailVerified,
    ...(nonce ? { nonce } : {}),
  });
  const audience = resource || `${issuer}/oauth/userinfo`;
  const accessToken = await signJwt(stored, {
    iss: issuer,
    sub: email,
    aud: audience,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
    email,
    email_verified: emailVerified,
    scope: tokenScope(resource, "openid email"),
  });
  await writeAudit(c.env.AUDIT, {
    type: "oauth.token",
    email,
    detail: client.id,
    ...auditMeta(c),
  });
  return c.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SEC,
    refresh_token: refreshToken,
    id_token: idToken,
    scope: tokenScope(resource, "openid email profile"),
  });
}

async function oauthRefresh(
  c: Context,
  body: Record<string, unknown>,
  creds: { id: string; secret: string },
): Promise<Response> {
  const presented = typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!presented) {
    return tokenError(c, "invalid_grant");
  }
  const client = await resolveClient(c.env.USERS, creds.id);
  if (!client) {
    return tokenError(c, "invalid_client", 401);
  }
  if (client.publicClient) {
    if (creds.secret) {
      return tokenError(c, "invalid_client", 401);
    }
  } else {
    const storedClient = await readClient(c.env.USERS, client.id);
    const secretOk =
      storedClient !== null &&
      creds.secret !== "" &&
      timingSafeEqual(storedClient.secretHash, await sha256Hex(creds.secret));
    if (!secretOk) {
      return tokenError(c, "invalid_client", 401);
    }
  }
  const hash = await sha256Hex(presented);
  const raw = await c.env.USERS.get(REFRESH_PREFIX + hash);
  if (!raw) {
    return tokenError(c, "invalid_grant");
  }
  let record: RefreshRecord;
  try {
    record = JSON.parse(raw) as RefreshRecord;
  } catch {
    await c.env.USERS.delete(REFRESH_PREFIX + hash);
    return tokenError(c, "invalid_grant");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!record.clientId || !record.email || typeof record.exp !== "number" || record.exp <= now) {
    await revokeRefreshChain(c.env.USERS, hash);
    return tokenError(c, "invalid_grant");
  }
  if (record.clientId !== client.id) {
    return tokenError(c, "invalid_grant");
  }
  const requested = typeof body.resource === "string" ? body.resource : "";
  if (requested && requested !== record.resource) {
    return tokenError(c, "invalid_target");
  }
  if (!(await refreshStillAllowed(c.env.USERS, record))) {
    await revokeRefreshChain(c.env.USERS, hash);
    return tokenError(c, "invalid_grant");
  }
  if (record.replacedBy) {
    const grace = await c.env.USERS.get(REFRESH_GRACE_PREFIX + hash);
    if (typeof grace === "string" && grace) {
      return mintedTokens(
        c,
        client,
        record.email,
        record.emailVerified === true,
        record.resource,
        "",
        grace,
      );
    }
    await revokeRefreshChain(c.env.USERS, hash);
    return tokenError(c, "invalid_grant");
  }
  const successor = await issueRefreshToken(c.env.USERS, {
    clientId: record.clientId,
    email: record.email,
    emailVerified: record.emailVerified === true,
    resource: record.resource,
  });
  const remain = Math.max(60, record.exp - now);
  await c.env.USERS.put(
    REFRESH_PREFIX + hash,
    JSON.stringify({ ...record, replacedBy: await sha256Hex(successor) } satisfies RefreshRecord),
    { expirationTtl: remain },
  );
  await c.env.USERS.put(REFRESH_GRACE_PREFIX + hash, successor, {
    expirationTtl: REFRESH_REUSE_SEC,
  });
  return mintedTokens(
    c,
    client,
    record.email,
    record.emailVerified === true,
    record.resource,
    "",
    successor,
  );
}

function clientCredentials(
  c: Context,
  body: Record<string, unknown>,
): { id: string; secret: string } {
  const header = c.req.header("Authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6).trim());
    const idx = decoded.indexOf(":");
    if (idx > 0) {
      return { id: decoded.slice(0, idx), secret: decoded.slice(idx + 1) };
    }
  }
  return {
    id: typeof body.client_id === "string" ? body.client_id : "",
    secret: typeof body.client_secret === "string" ? body.client_secret : "",
  };
}

export async function oauthToken(c: Context): Promise<Response> {
  const blocked = foreignHost(c);
  if (blocked) {
    return blocked;
  }
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const grant = typeof body.grant_type === "string" ? body.grant_type : "";
  const code = typeof body.code === "string" ? body.code : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const verifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
  const creds = clientCredentials(c, body);
  if (grant === "refresh_token") {
    return oauthRefresh(c, body, creds);
  }
  if (grant !== "authorization_code" || !code) {
    return tokenError(c, "unsupported_grant_type");
  }
  const client = await resolveClient(c.env.USERS, creds.id);
  if (!client) {
    return tokenError(c, "invalid_client", 401);
  }
  const storedClient = client.publicClient
    ? null
    : await readClient(c.env.USERS, client.id);
  const secretOk =
    storedClient !== null &&
    creds.secret !== "" &&
    timingSafeEqual(storedClient.secretHash, await sha256Hex(creds.secret));
  const raw = await c.env.USERS.get(CODE_PREFIX + code);
  if (!raw) {
    return tokenError(c, "invalid_grant");
  }
  const authCode = JSON.parse(raw) as AuthCode;
  await c.env.USERS.delete(CODE_PREFIX + code);
  if (
    authCode.exp <= Math.floor(Date.now() / 1000) ||
    authCode.clientId !== client.id ||
    authCode.redirectUri !== redirectUri
  ) {
    return tokenError(c, "invalid_grant");
  }
  if (!client.publicClient && !secretOk) {
    return tokenError(c, "invalid_client", 401);
  }
  if (client.publicClient && creds.secret) {
    return tokenError(c, "invalid_client", 401);
  }
  if (
    !authCode.codeChallenge ||
    !verifier ||
    (await pkceS256(verifier)) !== authCode.codeChallenge
  ) {
    return tokenError(c, "invalid_grant");
  }
  const refreshToken = await issueRefreshToken(c.env.USERS, {
    clientId: client.id,
    email: authCode.email,
    emailVerified: authCode.emailVerified === true,
    resource: authCode.resource,
  });
  return mintedTokens(
    c,
    client,
    authCode.email,
    authCode.emailVerified === true,
    authCode.resource,
    authCode.nonce,
    refreshToken,
  );
}

export async function oauthUserinfo(c: Context): Promise<Response> {
  const blocked = foreignHost(c);
  if (blocked) {
    return blocked;
  }
  const header = c.req.header("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return c.json({ error: "invalid_token" }, 401);
  }
  const stored = await loadSigningKey(c.env.USERS);
  const claims = await verifyOidcJwt(header.slice(7).trim(), stored.publicJwk);
  const issuer = issuerFor(c);
  const audienceOk =
    claims?.aud === `${issuer}/oauth/userinfo` ||
    (typeof claims?.aud === "string" && MCP_RESOURCES[claims.aud] !== undefined);
  if (!claims || claims.iss !== issuer || !audienceOk) {
    return c.json({ error: "invalid_token" }, 401);
  }
  return c.json({
    sub: claims.sub,
    email: claims.email,
    email_verified: claims.email_verified === true,
  });
}
