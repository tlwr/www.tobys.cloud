import type { Context } from "hono";
import { pictureCacheTags, purgePublic } from "./cache";
import {
  getPicture,
  listPictures,
  putPicture,
  type Picture,
} from "./pictures";
import {
  FILES_EXTENSION,
  filesCapability,
  McpProtocolError,
  uploadPicture,
  uploadPictureTool,
} from "./mcp-upload";
import {
  createTag,
  deleteTag,
  isValidTag,
  listTags,
  syncPictureTags,
} from "./tags";

export const MCP_RESOURCE = "https://jasmijnvink.com/mcp";

type Jwk = JsonWebKey & { kid?: string; alg?: string };

type Caller = {
  email: string;
  emailVerified: boolean;
};

type ToolResult = { text: string; isError?: boolean };

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

async function verifyAccessToken(
  token: string,
  jwk: Jwk,
  issuer: string,
): Promise<Caller | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  let header: { alg?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))) as {
      alg?: string;
    };
  } catch {
    return null;
  }
  if (header.alg !== "RS256") {
    return null;
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlDecode(parts[2]),
    data,
  );
  if (!ok) {
    return null;
  }
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  const scope = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (
    claims.iss !== issuer ||
    claims.aud !== MCP_RESOURCE ||
    !scope.includes("jvnl") ||
    exp <= Math.floor(Date.now() / 1000) ||
    typeof claims.email !== "string"
  ) {
    return null;
  }
  return {
    email: claims.email,
    emailVerified: claims.email_verified === true,
  };
}

async function signingKeys(issuer: string): Promise<Jwk[]> {
  const response = await fetch(`${issuer.replace(/\/$/, "")}/oauth/jwks`);
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
}

function wwwAuthenticate(origin: string): string {
  const metadata = `${origin}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadata}", scope="jvnl"`;
}

type RpcParams = {
  name?: string;
  uri?: string;
  arguments?: Record<string, unknown>;
  requestState?: unknown;
  protocolVersion?: string;
  _meta?: Record<string, unknown>;
};

type RpcMessage = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: RpcParams;
};

function rpcResult(id: unknown, result: unknown, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { status });
}

function rpcError(
  id: unknown,
  code: number,
  message: string,
  status = 200,
  data?: unknown,
): Response {
  const error: Record<string, unknown> = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return Response.json({ jsonrpc: "2.0", id, error }, { status });
}

function toolText(text: string, isError = false, modern = false): unknown {
  if (!modern) {
    return {
      content: [{ type: "text", text }],
      isError,
    };
  }
  return {
    resultType: "complete",
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function shown(value: string): string {
  return value.replace(/[\r\n]/g, "").slice(0, 80);
}

function decodeMcpHeader(value: string): string | null {
  const sentinel = value.match(/^=\?base64\?([A-Za-z0-9+/]+={0,2})\?=$/);
  if (sentinel) {
    try {
      const bin = atob(sentinel[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      return null;
    }
  }
  if (value.startsWith("=?base64?") || /[^\t\x20-\x7e]/.test(value)) {
    return null;
  }
  return value;
}

function negotiate(
  c: Context,
  message: RpcMessage,
): { modern: boolean } | Response {
  const id = message.id ?? null;
  const header = (c.req.header("mcp-protocol-version") ?? "").trim();
  const fromMeta = message.params?._meta?.[PROTOCOL_VERSION_META];
  const metaVersion = typeof fromMeta === "string" ? fromMeta : "";
  if (header && metaVersion && header !== metaVersion) {
    return rpcError(
      id,
      -32020,
      `Header mismatch: MCP-Protocol-Version header value '${shown(header)}' does not match body value '${shown(metaVersion)}'`,
      400,
    );
  }
  const requested = header || metaVersion;
  if (requested && !SUPPORTED_VERSIONS.includes(requested)) {
    return rpcError(id, -32022, "Unsupported protocol version", 400, {
      supported: SUPPORTED_VERSIONS,
      requested,
    });
  }
  if (requested !== "2026-07-28") {
    return { modern: false };
  }
  if (!header) {
    return rpcError(id, -32020, "Header mismatch: MCP-Protocol-Version header is missing.", 400);
  }
  if (!metaVersion) {
    return rpcError(
      id,
      -32020,
      "Header mismatch: MCP-Protocol-Version is missing from the body.",
      400,
    );
  }
  const methodHeader = c.req.header("mcp-method");
  if (!methodHeader) {
    return rpcError(id, -32020, "Header mismatch: Mcp-Method header is missing.", 400);
  }
  if (methodHeader !== (message.method ?? "")) {
    return rpcError(
      id,
      -32020,
      `Header mismatch: Mcp-Method header value '${shown(methodHeader)}' does not match body value '${shown(message.method ?? "")}'`,
      400,
    );
  }
  if (
    message.method === "tools/call" ||
    message.method === "resources/read" ||
    message.method === "prompts/get"
  ) {
    const rawName = c.req.header("mcp-name");
    if (!rawName) {
      return rpcError(id, -32020, "Header mismatch: Mcp-Name header is missing.", 400);
    }
    const decoded = decodeMcpHeader(rawName);
    if (decoded === null) {
      return rpcError(id, -32020, "Header mismatch: Mcp-Name header value is malformed.", 400);
    }
    const bodyName =
      message.method === "tools/call" ? message.params?.name ?? "" : message.params?.uri ?? "";
    if (decoded !== bodyName) {
      return rpcError(
        id,
        -32020,
        `Header mismatch: Mcp-Name header value '${shown(decoded)}' does not match body value '${shown(bodyName)}'`,
        400,
      );
    }
  }
  return { modern: true };
}

function uploadDeclared(params: RpcParams | undefined, modern: boolean): boolean {
  if (!modern) {
    return false;
  }
  const capabilities = params?._meta?.[CLIENT_CAPABILITIES_META];
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    return false;
  }
  const extensions = (capabilities as Record<string, unknown>).extensions;
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) {
    return false;
  }
  const settings = (extensions as Record<string, unknown>)[FILES_EXTENSION];
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return false;
  }
  if ("revision" in settings) {
    return false;
  }
  const upload = (settings as Record<string, unknown>).upload;
  return upload !== null && typeof upload === "object" && !Array.isArray(upload);
}

const SERVER_VERSION = "1.3";
const SUPPORTED_VERSIONS = ["2026-07-28", "2025-06-18"];
const PROTOCOL_VERSION_META = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_META = "io.modelcontextprotocol/clientCapabilities";

const INSTRUCTIONS = [
  "When the user asks which tags exist, or for a list of tags, call list_tags.",
  "Do not answer a tag question from list_pictures. Pictures only repeat tags they already use, and they omit empty tags.",
  "list_tags is the catalog. Use it before create_tag, delete_tag, or upload_picture.",
  "When the user asks to upload or add a picture, call upload_picture with a title and one image file. Do not use update_picture to upload bytes.",
  "upload_picture accepts JPEG, PNG, GIF, WebP, and SVG, up to 10 MB.",
  "When you mention a picture, always give both its numeric id and its title, written like #12 Mistige kabelbaan.",
  "Use the id when calling update_picture. Use the title so the person knows which photo you mean.",
].join(" ");

const TOOLS = [
  {
    name: "list_tags",
    description:
      "List every tag on jasmijnvink.com, including tags with no pictures. Call this for any question about which tags exist. Do not use list_pictures for that.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, title: "List tags" },
  },
  {
    name: "list_pictures",
    description:
      "List every picture on jasmijnvink.com, including hidden ones. Each picture is #id plus title. This is not the tag catalog.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, title: "List pictures" },
  },
  {
    name: "create_tag",
    description: "Create an empty tag. The name must be kebab-case.",
    inputSchema: {
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_tag",
    description: "Delete a tag and remove it from pictures. Pictures are kept.",
    inputSchema: {
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
      additionalProperties: false,
    },
  },
  {
    name: "update_picture",
    description:
      "Change a picture's title, description, tags, or visibility. Does not upload a new file.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Numeric picture id. In replies, also name the picture by its title.",
        },
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        visible: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  uploadPictureTool(),
];

function pictureLabel(id: string, title: string): string {
  return `#${id} ${title}`;
}

async function callTool(
  c: Context,
  name: string,
  args: Record<string, unknown>,
  origin: string,
  call: {
    modern: boolean;
    upload: boolean;
    principal: string;
    requestState: unknown;
    hasRequestState: boolean;
  },
): Promise<unknown> {
  if (name === "upload_picture") {
    return uploadPicture(
      c,
      call.principal,
      args,
      call.requestState,
      call.hasRequestState,
      call.upload,
      origin,
    );
  }
  const result = await callExistingTool(c, name, args, origin);
  return toolText(result.text, result.isError === true, call.modern);
}

async function callExistingTool(
  c: Context,
  name: string,
  args: Record<string, unknown>,
  origin: string,
): Promise<ToolResult> {
  if (name === "list_pictures") {
    const pictures = await listPictures(c.env.PICTURES, { includeHidden: true });
    const lines = pictures.map(
      (picture) =>
        `${pictureLabel(picture.id, picture.title)} — ${picture.visible ? "visible" : "hidden"} — tags: ${picture.tags.join(", ") || "none"}`,
    );
    const listed = pictures.map((picture) => ({
      id: picture.id,
      title: picture.title,
      label: pictureLabel(picture.id, picture.title),
      description: picture.description,
      visible: picture.visible,
      tags: picture.tags,
      image: `${origin}/pictures/${picture.id}/image`,
    }));
    const summary =
      lines.length === 0
        ? "No pictures."
        : `Pictures (${lines.length}). Mention each one as #id and title.\n${lines.join("\n")}`;
    return { text: `${summary}\n${JSON.stringify(listed)}` };
  }
  if (name === "list_tags") {
    const tags = await listTags(c.env.TAGS);
    const pictures = await listPictures(c.env.PICTURES, { includeHidden: true });
    const titles = new Map(pictures.map((picture) => [picture.id, picture.title]));
    const names = tags.map((tag) => tag.tag);
    const lines = tags.map((tag) => {
      const photos = tag.pictureIds.map((id) => pictureLabel(id, titles.get(id) ?? "untitled"));
      return `${tag.tag}: ${photos.length === 0 ? "no pictures" : photos.join(", ")}`;
    });
    const summary =
      names.length === 0
        ? "No tags."
        : `Tags (${names.length}): ${names.join(", ")}.\n${lines.join("\n")}`;
    return { text: `${summary}\n${JSON.stringify(tags)}` };
  }
  if (name === "create_tag") {
    const tag = typeof args.tag === "string" ? args.tag.trim().toLowerCase() : "";
    const result = await createTag(c.env.TAGS, tag);
    if (!result.ok) {
      return {
        text: result.reason === "exists" ? "Tag already exists." : "Tag must be kebab-case.",
        isError: true,
      };
    }
    await purgePublic(c, ["pictures", "tags", `tag-${tag}`]);
    return { text: `Created tag ${tag}.` };
  }
  if (name === "delete_tag") {
    const tag = typeof args.tag === "string" ? args.tag.trim().toLowerCase() : "";
    const result = await deleteTag(c.env.PICTURES, c.env.TAGS, tag);
    if (!result.ok) {
      return {
        text: result.reason === "not_found" ? "Tag not found." : "Tag must be kebab-case.",
        isError: true,
      };
    }
    await purgePublic(c, ["pictures", "tags", `tag-${tag}`]);
    return { text: `Deleted tag ${tag}.` };
  }
  if (name === "update_picture") {
    const id = typeof args.id === "string" ? args.id : "";
    const existing = await getPicture(c.env.PICTURES, id);
    if (!existing) {
      return { text: "Picture not found.", isError: true };
    }
    const title = typeof args.title === "string" ? args.title.trim() : existing.title;
    if (!title) {
      return { text: "Title is required.", isError: true };
    }
    const description =
      typeof args.description === "string" ? args.description : existing.description;
    const visible = typeof args.visible === "boolean" ? args.visible : existing.visible;
    let tags = existing.tags;
    if (Array.isArray(args.tags)) {
      const nextTags = args.tags.filter((tag): tag is string => typeof tag === "string");
      if (nextTags.some((tag) => !isValidTag(tag))) {
        return { text: "Tags must be kebab-case.", isError: true };
      }
      tags = nextTags;
    }
    const next: Picture = { ...existing, title, description, visible, tags };
    await putPicture(c.env.PICTURES, next);
    await syncPictureTags(c.env.TAGS, id, tags, existing.tags);
    await purgePublic(c, [
      ...pictureCacheTags(id, tags),
      ...existing.tags.map((tag) => `tag-${tag}`),
    ]);
    return {
      text: `Updated ${pictureLabel(id, title)}.\n${JSON.stringify({ id, title, label: pictureLabel(id, title), description, visible, tags })}`,
    };
  }
  return { text: "Unknown tool.", isError: true };
}

export function protectedResourceMetadata(origin: string): Record<string, unknown> {
  return {
    resource: MCP_RESOURCE,
    authorization_servers: ["https://auth.tobys.cloud"],
    scopes_supported: ["openid", "email", "jvnl"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/`,
  };
}

export async function handleMcp(c: Context): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const header = c.req.header("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": wwwAuthenticate(origin) },
    });
  }
  const issuer = (c.env.AUTH_ISSUER as string | undefined) || "https://auth.tobys.cloud";
  const keys = await signingKeys(issuer);
  let caller: Caller | null = null;
  for (const key of keys) {
    caller = await verifyAccessToken(header.slice(7).trim(), key, issuer.replace(/\/$/, ""));
    if (caller) {
      break;
    }
  }
  if (!caller) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": wwwAuthenticate(origin) },
    });
  }
  let message: RpcMessage;
  try {
    message = (await c.req.json()) as RpcMessage;
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const negotiated = negotiate(c, message);
  if (negotiated instanceof Response) {
    return negotiated;
  }
  const modern = negotiated.modern;
  const id = message.id ?? null;
  const params = message.params ?? {};
  if (message.method === "initialize") {
    const requested =
      typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    const version = requested === "2026-07-28" ? "2026-07-28" : "2025-06-18";
    return rpcResult(id, {
      protocolVersion: version,
      capabilities:
        version === "2026-07-28"
          ? {
              tools: { listChanged: false },
              extensions: { [FILES_EXTENSION]: filesCapability() },
            }
          : { tools: { listChanged: false } },
      serverInfo: { name: "jasmijnvink", version: SERVER_VERSION },
      instructions: INSTRUCTIONS,
    });
  }
  if (message.method === "server/discover") {
    return rpcResult(id, {
      resultType: "complete",
      supportedVersions: SUPPORTED_VERSIONS,
      capabilities: {
        tools: { listChanged: false },
        extensions: { [FILES_EXTENSION]: filesCapability() },
      },
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: "jasmijnvink",
          version: SERVER_VERSION,
        },
      },
      instructions: INSTRUCTIONS,
      ttlMs: 3_600_000,
      cacheScope: "public",
    });
  }
  if (message.method === "tools/list") {
    if (!modern) {
      return rpcResult(id, { tools: TOOLS });
    }
    return rpcResult(id, {
      resultType: "complete",
      tools: TOOLS,
      ttlMs: 0,
      cacheScope: "private",
    });
  }
  if (message.method === "tools/call") {
    const name = params.name ?? "";
    const args = params.arguments ?? {};
    try {
      const result = await callTool(c, name, args, origin, {
        modern,
        upload: uploadDeclared(params, modern),
        principal: caller.email,
        requestState: params.requestState,
        hasRequestState: Object.prototype.hasOwnProperty.call(params, "requestState"),
      });
      return rpcResult(id, result);
    } catch (error) {
      if (error instanceof McpProtocolError) {
        return rpcError(id, error.code, error.message, error.status, error.data);
      }
      return rpcResult(
        id,
        toolText("The tool failed. It might have done part of its work.", true, modern),
      );
    }
  }
  if (message.method === "ping") {
    return rpcResult(id, modern ? { resultType: "complete" } : {});
  }
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  return rpcError(id, -32601, "Method not found", modern ? 404 : 200);
}
