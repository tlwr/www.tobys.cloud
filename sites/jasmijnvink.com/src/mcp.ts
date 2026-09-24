import type { Context } from "hono";
import { pictureCacheTags, purgePublic } from "./cache";
import {
  getPicture,
  listPictures,
  putPicture,
  type Picture,
} from "./pictures";
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

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function toolText(text: string, isError = false): unknown {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

const INSTRUCTIONS = [
  "When the user asks which tags exist, or for a list of tags, call list_tags.",
  "Do not answer a tag question from list_pictures. Pictures only repeat tags they already use, and they omit empty tags.",
  "list_tags is the catalog. Use it before create_tag or delete_tag.",
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
];

function pictureLabel(id: string, title: string): string {
  return `#${id} ${title}`;
}

async function callTool(
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
  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try {
    message = (await c.req.json()) as typeof message;
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const id = message.id ?? null;
  const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
  if (message.method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "jasmijnvink", version: "1.2" },
      instructions: INSTRUCTIONS,
    });
  }
  if (message.method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (message.method === "tools/call") {
    const name = params.name ?? "";
    const args = params.arguments ?? {};
    const result = await callTool(c, name, args, origin);
    return rpcResult(id, toolText(result.text, result.isError));
  }
  if (message.method === "ping") {
    return rpcResult(id, {});
  }
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  return Response.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found" },
  });
}
