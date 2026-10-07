import {
  getWorkout,
  listWorkouts,
  LogbookError,
  logbookProfile,
  type ListQuery,
} from "./concept2";

export const MCP_RESOURCE = "https://erg.tobys.cloud/mcp";

type Jwk = JsonWebKey & { kid?: string; alg?: string };

type Caller = { email: string };

type ToolResult = { text: string; isError?: boolean };

export type Env = {
  CONCEPT2_ACCESS_TOKEN?: string;
  AUTH_ISSUER?: string;
};

const INSTRUCTIONS = [
  "This server reads one Concept2 logbook. It cannot create or edit workouts.",
  "Distances are meters. time_tenths is tenths of a second. pace is per 500m for the rower and SkiErg, and per 1000m for the bike.",
  "Use list_results for a date range or machine type. Use get_result with the numeric id for splits.",
  "Do not invent workouts that are not in the tool result.",
].join(" ");

const TOOLS = [
  {
    name: "logbook_profile",
    description: "Read the Concept2 logbook profile for this account.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, title: "Logbook profile" },
  },
  {
    name: "list_results",
    description:
      "List workouts from the Concept2 logbook. Newest pages come first. Filter with from, to (YYYY-MM-DD), and type.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Inclusive start date, YYYY-MM-DD." },
        to: { type: "string", description: "Inclusive end date, YYYY-MM-DD." },
        type: {
          type: "string",
          description:
            "rower, skierg, bike, dynamic, slides, paddle, water, snow, rollerski, or multierg.",
        },
        page: { type: "number", description: "Page number, starting at 1." },
        per_page: { type: "number", description: "Page size, 1 to 50. Default 20." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, title: "List workouts" },
  },
  {
    name: "get_result",
    description: "Read one workout, including splits or intervals when the logbook has them.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Numeric result id from list_results." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, title: "Get workout" },
  },
];

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
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
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
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
    !scope.includes("erg") ||
    exp <= Math.floor(Date.now() / 1000) ||
    typeof claims.email !== "string"
  ) {
    return null;
  }
  return { email: claims.email };
}

async function signingKeys(issuer: string): Promise<Jwk[]> {
  const response = await fetch(`${issuer.replace(/\/$/, "")}/oauth/jwks`);
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
}

function wwwAuthenticate(): string {
  return `Bearer resource_metadata="https://erg.tobys.cloud/.well-known/oauth-protected-resource", scope="erg"`;
}

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function toolText(text: string, isError = false): unknown {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function callTool(
  env: Env,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const token = env.CONCEPT2_ACCESS_TOKEN ?? "";
  try {
    if (name === "logbook_profile") {
      return { text: await logbookProfile(token) };
    }
    if (name === "list_results") {
      const query: ListQuery = {
        from: optionalString(args.from),
        to: optionalString(args.to),
        type: optionalString(args.type),
        page: optionalNumber(args.page),
        perPage: optionalNumber(args.per_page),
      };
      return { text: await listWorkouts(token, query) };
    }
    if (name === "get_result") {
      return { text: await getWorkout(token, optionalString(args.id) ?? "") };
    }
    return { text: "Unknown tool.", isError: true };
  } catch (error) {
    if (error instanceof LogbookError) {
      return { text: error.message, isError: true };
    }
    return { text: "Concept2 request failed.", isError: true };
  }
}

export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: MCP_RESOURCE,
    authorization_servers: ["https://auth.tobys.cloud"],
    scopes_supported: ["openid", "email", "erg"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://erg.tobys.cloud/",
  };
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": wwwAuthenticate(), "cache-control": "no-store" },
    });
  }
  const issuer = env.AUTH_ISSUER || "https://auth.tobys.cloud";
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
      headers: { "www-authenticate": wwwAuthenticate(), "cache-control": "no-store" },
    });
  }
  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try {
    message = (await request.json()) as typeof message;
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const id = message.id ?? null;
  const params = (message.params ?? {}) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  if (message.method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "erg", version: "1.0" },
      instructions: INSTRUCTIONS,
    });
  }
  if (message.method === "notifications/initialized" || message.method === "ping") {
    if (message.id === undefined) {
      return new Response(null, { status: 202 });
    }
    return rpcResult(id, {});
  }
  if (message.method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (message.method === "tools/call") {
    const result = await callTool(env, params.name ?? "", params.arguments ?? {});
    return rpcResult(id, toolText(result.text, result.isError));
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
