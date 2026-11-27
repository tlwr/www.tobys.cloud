import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./index";
import type { Env } from "./env";

const ISSUER = "https://auth.tobys.cloud";
const ACCOUNT = "a".repeat(32);
const ACCESS_KEY = "test-access-key";
const SECRET = "test-secret-key-that-must-not-leak";
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);
const SVG = new TextEncoder().encode(
  "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'></svg>",
);

class MemoryKV {
  private store = new Map<string, string>();
  constructor(entries: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(entries)) {
      this.store.set(key, value);
    }
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
  async list() {
    return {
      keys: [...this.store.keys()].map((name) => ({ name })),
      list_complete: true as const,
      cacheStatus: null,
    };
  }
}

class MemoryR2 {
  private store = new Map<string, { body: Uint8Array; contentType?: string }>();

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    opts?: {
      onlyIf?: { etagDoesNotMatch?: string };
      httpMetadata?: { contentType?: string };
    },
  ) {
    if (opts?.onlyIf?.etagDoesNotMatch === "*" && this.store.has(key)) {
      return null;
    }
    let body: Uint8Array;
    if (typeof value === "string") {
      body = new TextEncoder().encode(value);
    } else if (ArrayBuffer.isView(value)) {
      body = new Uint8Array(value.byteLength);
      body.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    } else {
      body = new Uint8Array(value);
    }
    this.store.set(key, { body, contentType: opts?.httpMetadata?.contentType });
    return { key, size: body.byteLength };
  }

  async get(key: string) {
    const found = this.store.get(key);
    if (!found) {
      return null;
    }
    const body = found.body;
    return {
      size: body.byteLength,
      body,
      httpEtag: '"etag"',
      async arrayBuffer() {
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      },
      writeHttpMetadata(headers: Headers) {
        if (found.contentType) {
          headers.set("Content-Type", found.contentType);
        }
      },
    };
  }

  async delete(key: string) {
    this.store.delete(key);
  }

  has(key: string) {
    return this.store.has(key);
  }
}

function env(
  pictures: MemoryKV,
  tags: MemoryKV,
  images: MemoryR2 = new MemoryR2(),
  signing = true,
): Env {
  return {
    PICTURES: pictures as unknown as KVNamespace,
    TAGS: tags as unknown as KVNamespace,
    IMAGES: images as unknown as R2Bucket,
    FONTS: { get: async () => null } as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } as unknown as Fetcher,
    AUTH_ISSUER: ISSUER,
    ...(signing
      ? {
          R2_ACCOUNT_ID: ACCOUNT,
          R2_ACCESS_KEY_ID: ACCESS_KEY,
          R2_SECRET_ACCESS_KEY: SECRET,
        }
      : {}),
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let raw = "";
  for (const byte of new Uint8Array(digest)) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data));
  let raw = "";
  for (const byte of sig) {
    raw += String.fromCharCode(byte);
  }
  const signature = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${header}.${payload}.${signature}`;
}

async function caller(email = "toby@example.com"): Promise<{ token: string; publicJwk: JsonWebKey }> {
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
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  publicJwk.alg = "RS256";
  const token = await signToken(pair.privateKey, {
    iss: ISSUER,
    aud: "https://jasmijnvink.com/mcp",
    email,
    scope: "openid email jvnl",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return { token, publicJwk };
}

function stubJwks(publicJwk: JsonWebKey) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${ISSUER}/oauth/jwks`);
      return Response.json({ keys: [publicJwk] });
    }),
  );
}

function meta(files: Record<string, unknown> | null = { upload: {} }) {
  return {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {
      extensions: files === null ? {} : { "io.modelcontextprotocol/files": files },
    },
  };
}

function modernHeaders(method: string, name?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
    ...(name ? { "mcp-name": name } : {}),
  };
}

async function rpc(
  binding: Env,
  token: string,
  body: unknown,
  headers: Record<string, string>,
) {
  return app.request(
    "https://jasmijnvink.com/mcp",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify(body),
    },
    binding,
  );
}

function uploadArgs(
  bytes: Uint8Array,
  digest: string,
  extra: Record<string, unknown> = {},
  fileExtra: Record<string, unknown> = {},
) {
  return {
    title: "Mistige kabelbaan",
    ...extra,
    file: {
      id: "file-1",
      name: "foto.png",
      mimeType: "image/png",
      size: bytes.byteLength,
      digest: { algorithm: "sha-256", value: digest },
      ...fileExtra,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mcp", () => {
  it("publishes protected resource metadata", async () => {
    const res = await app.request(
      "https://jasmijnvink.com/.well-known/oauth-protected-resource",
      {},
      env(new MemoryKV(), new MemoryKV()),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(body.resource).toBe("https://jasmijnvink.com/mcp");
    expect(body.authorization_servers).toEqual(["https://auth.tobys.cloud"]);
  });

  it("asks for a token when /mcp is called anonymously", async () => {
    const res = await app.request(
      "https://jasmijnvink.com/mcp",
      {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        headers: { "content-type": "application/json" },
      },
      env(new MemoryKV(), new MemoryKV()),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("oauth-protected-resource");
  });

  it("keeps the 2025-06-18 handshake and tool results", async () => {
    const { token, publicJwk } = await caller();
    stubJwks(publicJwk);
    const pictures = new MemoryKV({
      "1": JSON.stringify({
        id: "1",
        title: "Oud",
        description: "",
        visible: true,
        tags: [],
        r2Key: "pictures/1",
        contentType: "image/png",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    const binding = env(pictures, new MemoryKV());
    const headers = {
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    };

    const init = await rpc(
      binding,
      token,
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      headers,
    );
    expect(init.status).toBe(200);
    const initBody = (await init.json()) as {
      result: { protocolVersion: string; capabilities: Record<string, unknown>; serverInfo: { version: string } };
    };
    expect(initBody.result.protocolVersion).toBe("2025-06-18");
    expect(initBody.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(initBody.result.serverInfo.version).toBe("1.3");

    const listed = await rpc(
      binding,
      token,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      headers,
    );
    const listedBody = (await listed.json()) as { result: { tools: { name: string }[]; resultType?: string } };
    expect(listedBody.result.resultType).toBeUndefined();
    expect(listedBody.result.tools.map((tool) => tool.name)).toEqual([
      "list_tags",
      "list_pictures",
      "create_tag",
      "delete_tag",
      "update_picture",
      "upload_picture",
    ]);

    const updated = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "update_picture", arguments: { id: "1", title: "Nieuw" } },
      },
      headers,
    );
    const updatedBody = (await updated.json()) as {
      result: { content: { text: string }[]; isError: boolean; resultType?: string };
    };
    expect(updated.status).toBe(200);
    expect(updatedBody.result.resultType).toBeUndefined();
    expect(updatedBody.result.isError).toBe(false);
    expect(updatedBody.result.content[0]?.text).toContain("#1 Nieuw");
  });

  it("advertises file upload on server/discover and the 2026-07-28 tool list", async () => {
    const { token, publicJwk } = await caller();
    stubJwks(publicJwk);
    const binding = env(new MemoryKV(), new MemoryKV(), new MemoryR2(), false);

    const discovered = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: "discover-1",
        method: "server/discover",
        params: { _meta: meta(null) },
      },
      modernHeaders("server/discover"),
    );
    expect(discovered.status).toBe(200);
    const discoveredBody = (await discovered.json()) as {
      result: {
        supportedVersions: string[];
        capabilities: { extensions: Record<string, unknown> };
        cacheScope: string;
        _meta: { "io.modelcontextprotocol/serverInfo": { name: string } };
      };
    };
    expect(discoveredBody.result.supportedVersions).toEqual(["2026-07-28", "2025-06-18"]);
    expect(discoveredBody.result.capabilities.extensions).toEqual({
      "io.modelcontextprotocol/files": { upload: {} },
    });
    expect(discoveredBody.result.cacheScope).toBe("public");
    expect(discoveredBody.result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("jasmijnvink");
    expect(JSON.stringify(discoveredBody)).not.toContain("toby@example.com");

    const listed = await rpc(
      binding,
      token,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta() } },
      modernHeaders("tools/list"),
    );
    const listedBody = (await listed.json()) as {
      result: {
        resultType: string;
        ttlMs: number;
        cacheScope: string;
        tools: { name: string; inputSchema: { properties?: { file?: Record<string, unknown> }; "x-mcp-file"?: unknown } }[];
      };
    };
    expect(listedBody.result.resultType).toBe("complete");
    expect(listedBody.result.ttlMs).toBe(0);
    expect(listedBody.result.cacheScope).toBe("private");
    const upload = listedBody.result.tools.find((tool) => tool.name === "upload_picture");
    expect(upload?.inputSchema["x-mcp-file"]).toBeUndefined();
    expect(upload?.inputSchema.properties?.file).toMatchObject({
      "x-mcp-file": {
        accept: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
        maxSize: 10 * 1024 * 1024,
      },
      required: ["id", "mimeType", "size", "digest"],
    });

    const handshake = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "initialize",
        params: { protocolVersion: "2026-07-28" },
      },
      { "content-type": "application/json" },
    );
    const handshakeBody = (await handshake.json()) as {
      result: { protocolVersion: string; capabilities: { extensions: Record<string, unknown> } };
    };
    expect(handshakeBody.result.protocolVersion).toBe("2026-07-28");
    expect(handshakeBody.result.capabilities.extensions["io.modelcontextprotocol/files"]).toEqual({
      upload: {},
    });
  });

  it("rejects a modern call whose headers do not match the body", async () => {
    const { token, publicJwk } = await caller();
    stubJwks(publicJwk);
    const binding = env(new MemoryKV(), new MemoryKV());
    const mismatch = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_tags", arguments: {}, _meta: meta(null) },
      },
      modernHeaders("tools/list", "list_tags"),
    );
    expect(mismatch.status).toBe(400);
    const mismatchBody = (await mismatch.json()) as { error: { code: number } };
    expect(mismatchBody.error.code).toBe(-32020);

    const unsupported = await rpc(
      binding,
      token,
      { jsonrpc: "2.0", id: 2, method: "ping" },
      { "content-type": "application/json", "mcp-protocol-version": "1900-01-01" },
    );
    expect(unsupported.status).toBe(400);
    const unsupportedBody = (await unsupported.json()) as {
      error: { code: number; data: { supported: string[]; requested: string } };
    };
    expect(unsupportedBody.error.code).toBe(-32022);
    expect(unsupportedBody.error.data.supported).toEqual(["2026-07-28", "2025-06-18"]);
    expect(unsupportedBody.error.data.requested).toBe("1900-01-01");

    const missing = await rpc(
      binding,
      token,
      { jsonrpc: "2.0", id: 9, method: "nope", params: { _meta: meta(null) } },
      modernHeaders("nope"),
    );
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("uploads a picture through a pre-signed target and refuses to run it twice", async () => {
    const { token, publicJwk } = await caller();
    stubJwks(publicJwk);
    const pictures = new MemoryKV();
    const tags = new MemoryKV({ portret: "[]" });
    const images = new MemoryR2();
    const binding = env(pictures, tags, images);
    const digest = await sha256(PNG);
    const args = uploadArgs(PNG, digest, { description: "ochtend", tags: ["portret"], visible: true });

    const first = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "upload_picture", arguments: args, _meta: meta() },
      },
      modernHeaders("tools/call", "upload_picture"),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      result: {
        resultType: string;
        content: unknown[];
        requestState: string;
        uploads: {
          fileId: string;
          url: string;
          method: string;
          credentials: string;
          expiresAt: string;
          headers: Record<string, string>;
        }[];
      };
    };
    expect(firstBody.result.resultType).toBe("upload_required");
    expect(firstBody.result.content).toEqual([]);
    expect(firstBody.result.uploads).toHaveLength(1);
    const upload = firstBody.result.uploads[0];
    expect(upload?.fileId).toBe("file-1");
    expect(upload?.method).toBe("PUT");
    expect(upload?.credentials).toBe("omit");
    expect(upload?.headers).toEqual({ "Content-Type": "image/png", "If-None-Match": "*" });
    expect(upload?.headers["Content-Length"]).toBeUndefined();
    const expiresIn = new Date(upload?.expiresAt ?? "").getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(20 * 60 * 1000);
    expect(expiresIn).toBeLessThan(31 * 60 * 1000);
    const target = new URL(upload?.url ?? "");
    expect(target.protocol).toBe("https:");
    expect(target.hostname).toBe(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(target.username).toBe("");
    expect(target.hash).toBe("");
    expect(target.pathname.startsWith("/jasmijnvink-com-images/staging/")).toBe(true);
    expect(target.pathname).not.toContain(firstBody.result.requestState);
    expect(target.pathname).not.toContain("..");
    expect(target.searchParams.get("X-Amz-Expires")).toBe("1800");
    expect(target.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host;if-none-match",
    );
    expect([...target.searchParams.keys()].some((key) => key.toLowerCase().includes("checksum"))).toBe(
      false,
    );
    expect(JSON.stringify(firstBody)).not.toContain(SECRET);
    const stagingKey = decodeURIComponent(target.pathname.slice("/jasmijnvink-com-images/".length));

    await images.put(stagingKey, PNG, { httpMetadata: { contentType: "image/png" } });
    const retryArgs = {
      file: args.file,
      visible: true,
      tags: ["portret"],
      description: "ochtend",
      title: "Mistige kabelbaan",
    };
    const second = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "upload_picture",
          arguments: retryArgs,
          requestState: firstBody.result.requestState,
          _meta: meta(),
        },
      },
      modernHeaders("tools/call", "upload_picture"),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      result: { resultType: string; isError?: boolean; content: { text: string }[] };
    };
    expect(secondBody.result.resultType).toBe("complete");
    expect(secondBody.result.isError).toBeUndefined();
    expect(secondBody.result.content[0]?.text).toContain("#1 Mistige kabelbaan");
    expect(JSON.stringify(secondBody)).not.toContain(firstBody.result.requestState);
    expect(JSON.stringify(secondBody)).not.toContain("X-Amz-Signature");
    const objectId = stagingKey.slice("staging/".length);
    expect(images.has(`confirmed/${objectId}`)).toBe(true);
    expect(images.has(`mcp-state/${firstBody.result.requestState}`)).toBe(true);
    expect(images.has("pictures/1")).toBe(true);

    const image = await app.request("https://jasmijnvink.com/pictures/1/image", {}, binding);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
    expect(await tags.get("portret")).toBe(JSON.stringify(["1"]));

    const replay = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "upload_picture",
          arguments: retryArgs,
          requestState: firstBody.result.requestState,
          _meta: meta(),
        },
      },
      modernHeaders("tools/call", "upload_picture"),
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { error: { code: number; message: string } };
    expect(replayBody.error.code).toBe(-32602);
    expect(replayBody.error.message).not.toContain(firstBody.result.requestState);
    expect(await pictures.get("2")).toBeNull();
  });

  it("does not consume requestState when the bytes or the arguments fail", async () => {
    const { token, publicJwk } = await caller();
    const other = await caller("other@example.com");
    stubJwks(publicJwk);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(`${ISSUER}/oauth/jwks`);
        return Response.json({ keys: [publicJwk, other.publicJwk] });
      }),
    );
    const images = new MemoryR2();
    const binding = env(new MemoryKV(), new MemoryKV(), images);
    const digest = await sha256(PNG);
    const args = uploadArgs(PNG, digest);

    const opened = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "upload_picture", arguments: args, _meta: meta() },
      },
      modernHeaders("tools/call", "upload_picture"),
    );
    const openedBody = (await opened.json()) as { result: { requestState: string; uploads: { url: string }[] } };
    const state = openedBody.result.requestState;
    const stagingKey = decodeURIComponent(
      new URL(openedBody.result.uploads[0]?.url ?? "").pathname.slice("/jasmijnvink-com-images/".length),
    );
    const retry = (requestState: string, nextArgs: unknown, bearer = token) =>
      rpc(
        binding,
        bearer,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "upload_picture",
            arguments: nextArgs,
            requestState,
            _meta: meta(),
          },
        },
        modernHeaders("tools/call", "upload_picture"),
      );

    const missing = await retry(state, args);
    expect(((await missing.json()) as { result: { isError: boolean } }).result.isError).toBe(true);

    await images.put(stagingKey, PNG.subarray(0, 4));
    const short = await retry(state, args);
    expect(((await short.json()) as { result: { isError: boolean } }).result.isError).toBe(true);

    const wrong = new Uint8Array(PNG);
    wrong[20] ^= 0xff;
    await images.put(stagingKey, wrong);
    const mismatched = await retry(state, args);
    expect((await mismatched.json()) as { result: { isError: boolean; content: { text: string }[] } }).toMatchObject({
      result: { isError: true },
    });

    await images.put(stagingKey, PNG);
    const renamed = await retry(state, { ...args, title: "Andere titel" });
    expect(((await renamed.json()) as { error: { code: number } }).error.code).toBe(-32602);
    const stranger = await retry(state, args, other.token);
    expect(((await stranger.json()) as { error: { code: number } }).error.code).toBe(-32602);
    const forged = await retry(`${state.slice(0, -1)}x`, args);
    expect(((await forged.json()) as { error: { code: number } }).error.code).toBe(-32602);

    const done = await retry(state, args);
    expect(((await done.json()) as { result: { isError?: boolean; content: { text: string }[] } }).result.content[0]?.text).toContain(
      "#1 Mistige kabelbaan",
    );
  });

  it("runs the upload once when two retries arrive together", async () => {
    const { token, publicJwk } = await caller();
    stubJwks(publicJwk);
    const pictures = new MemoryKV();
    const images = new MemoryR2();
    const binding = env(pictures, new MemoryKV(), images);
    const digest = await sha256(PNG);
    const args = uploadArgs(PNG, digest);
    const opened = await rpc(
      binding,
      token,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "upload_picture", arguments: args, _meta: meta() },
      },
      modernHeaders("tools/call", "upload_picture"),
    );
    const openedBody = (await opened.json()) as { result: { requestState: string; uploads: { url: string }[] } };
    const stagingKey = decodeURIComponent(
      new URL(openedBody.result.uploads[0]?.url ?? "").pathname.slice("/jasmijnvink-com-images/".length),
    );
    await images.put(stagingKey, PNG);
    const call = () =>
      rpc(
        binding,
        token,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "upload_picture",
            arguments: args,
            requestState: openedBody.result.requestState,
            _meta: meta(),
          },
        },
        modernHeaders("tools/call", "upload_picture"),
      );
    const [left, right] = await Promise.all([call(), call()]);
    const bodies = [await left.json(), await right.json()] as {
      result?: { isError?: boolean };
      error?: { code: number };
    }[];
    const wins = bodies.filter((body) => body.result && !body.result.isError);
    const losses = bodies.filter((body) => body.error?.code === -32602);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(await pictures.get("2")).toBeNull();
  });

  it("refuses upload when the client cannot send files or the bytes are not a picture", async () => {
    const { token, publicJwk } = await caller();
    stubJwks(publicJwk);
    const pictures = new MemoryKV();
    const images = new MemoryR2();
    await images.put("pictures/1", PNG);
    const binding = env(pictures, new MemoryKV(), images);
    const digest = await sha256(PNG);
    const args = uploadArgs(PNG, digest);
    const call = (params: unknown, headers = modernHeaders("tools/call", "upload_picture")) =>
      rpc(
        binding,
        token,
        { jsonrpc: "2.0", id: 1, method: "tools/call", params },
        headers,
      );

    const undeclared = await call({
      name: "upload_picture",
      arguments: args,
      _meta: meta(null),
    });
    expect(undeclared.status).toBe(400);
    expect(await undeclared.json()).toMatchObject({
      error: {
        code: -32021,
        data: {
          requiredCapabilities: {
            extensions: { "io.modelcontextprotocol/files": { upload: {} } },
          },
        },
      },
    });

    const legacy = await call(
      {
        name: "upload_picture",
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/clientCapabilities": {
            extensions: { "io.modelcontextprotocol/files": { upload: {} } },
          },
        },
      },
      { "content-type": "application/json", "mcp-protocol-version": "2025-06-18" },
    );
    expect(legacy.status).toBe(400);
    expect(((await legacy.json()) as { error: { code: number } }).error.code).toBe(-32021);

    const revised = await call({
      name: "upload_picture",
      arguments: args,
      _meta: meta({ upload: {}, revision: "2099-01-01" }),
    });
    expect(((await revised.json()) as { error: { code: number } }).error.code).toBe(-32021);

    const inline = await call({
      name: "upload_picture",
      arguments: uploadArgs(PNG, digest, {}, { data: "aaaa" }),
      _meta: meta(),
    });
    const inlineBody = await inline.json();
    expect(inlineBody).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(inlineBody)).not.toContain("aaaa");

    const source = "https://evil.example/secret.png";
    const sourced = await call({
      name: "upload_picture",
      arguments: uploadArgs(PNG, digest, {}, { source: { url: source } }),
      _meta: meta(),
    });
    const sourcedBody = await sourced.json();
    expect(sourcedBody).toMatchObject({
      result: {
        isError: true,
        _meta: {
          "io.modelcontextprotocol/files": {
            sourceErrors: [{ fileId: "file-1", reason: "declined" }],
          },
        },
      },
    });
    expect(JSON.stringify(sourcedBody)).not.toContain(source);
    expect(vi.mocked(fetch).mock.calls.map((callArgs) => String(callArgs[0]))).toEqual([
      `${ISSUER}/oauth/jwks`,
      `${ISSUER}/oauth/jwks`,
      `${ISSUER}/oauth/jwks`,
      `${ISSUER}/oauth/jwks`,
      `${ISSUER}/oauth/jwks`,
    ]);

    const empty = await call({
      name: "upload_picture",
      arguments: uploadArgs(PNG, digest, {}, { size: 0 }),
      _meta: meta(),
    });
    expect(((await empty.json()) as { result: { isError: boolean } }).result.isError).toBe(true);

    const huge = await call({
      name: "upload_picture",
      arguments: uploadArgs(PNG, digest, {}, { size: 10 * 1024 * 1024 + 1 }),
      _meta: meta(),
    });
    expect(((await huge.json()) as { result: { isError: boolean } }).result.isError).toBe(true);

    const tiff = await call({
      name: "upload_picture",
      arguments: uploadArgs(PNG, digest, {}, { mimeType: "image/tiff" }),
      _meta: meta(),
    });
    expect(((await tiff.json()) as { result: { isError: boolean } }).result.isError).toBe(true);

    const unknownTag = await call({
      name: "upload_picture",
      arguments: uploadArgs(PNG, digest, { tags: ["missing-tag"] }),
      _meta: meta(),
    });
    expect(((await unknownTag.json()) as { result: { isError: boolean; content: { text: string }[] } }).result).toMatchObject({
      isError: true,
      content: [{ text: "Unknown tag: missing-tag." }],
    });
    expect((await pictures.list()).keys.some((key) => key.name.startsWith("mcp-upload:"))).toBe(false);

    const unconfigured = await rpc(
      env(new MemoryKV(), new MemoryKV(), new MemoryR2(), false),
      token,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "upload_picture", arguments: args, _meta: meta() },
      },
      modernHeaders("tools/call", "upload_picture"),
    );
    const unconfiguredBody = await unconfigured.json();
    expect(unconfiguredBody).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(unconfiguredBody)).not.toContain("r2.cloudflarestorage.com");

    const hostile = await rpc(
      {
        ...binding,
        R2_ACCOUNT_ID: "evil.example",
      },
      token,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "upload_picture", arguments: args, _meta: meta() },
      },
      modernHeaders("tools/call", "upload_picture"),
    );
    expect(JSON.stringify(await hostile.json())).not.toContain("evil.example");

    const badKey = "b".repeat(43);
    await pictures.put(
      `mcp-upload:${badKey}`,
      JSON.stringify({
        tool: "upload_picture",
        principal: "toby@example.com",
        arguments: args,
        stagingKey: "pictures/1",
        confirmedKey: `confirmed/${"c".repeat(43)}`,
        size: PNG.byteLength,
        declaredType: "image/png",
        digest,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const poisoned = await call({
      name: "upload_picture",
      arguments: args,
      requestState: badKey,
      _meta: meta(),
    });
    expect(((await poisoned.json()) as { error: { code: number } }).error.code).toBe(-32602);
    expect(new Uint8Array((await images.get("pictures/1"))?.body ?? [])).toEqual(PNG);
  });

  it("sniffs a declared octet-stream and accepts an svg sent as text", async () => {
    const { token, publicJwk } = await caller();
    stubJwks(publicJwk);
    const images = new MemoryR2();
    const binding = env(new MemoryKV(), new MemoryKV(), images);
    const pngDigest = await sha256(PNG);
    const svgDigest = await sha256(SVG);

    async function upload(mimeType: string, bytes: Uint8Array, digest: string, title: string) {
      const opened = await rpc(
        binding,
        token,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "upload_picture",
            arguments: {
              title,
              file: {
                id: "file-1",
                name: mimeType === "text/plain" ? "../../pictures/1.svg" : "blob.bin",
                mimeType,
                size: bytes.byteLength,
                digest: { algorithm: "sha-256", value: digest },
              },
            },
            _meta: meta(),
          },
        },
        modernHeaders("tools/call", "upload_picture"),
      );
      const body = (await opened.json()) as { result: { requestState: string; uploads: { url: string }[] } };
      const stagingKey = decodeURIComponent(
        new URL(body.result.uploads[0]?.url ?? "").pathname.slice("/jasmijnvink-com-images/".length),
      );
      expect(stagingKey.startsWith("staging/")).toBe(true);
      expect(stagingKey).not.toContain("pictures");
      await images.put(stagingKey, bytes);
      const finished = await rpc(
        binding,
        token,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "upload_picture",
            arguments: {
              title,
              file: {
                id: "file-1",
                name: mimeType === "text/plain" ? "../../pictures/1.svg" : "blob.bin",
                mimeType,
                size: bytes.byteLength,
                digest: { algorithm: "sha-256", value: digest },
              },
            },
            requestState: body.result.requestState,
            _meta: meta(),
          },
        },
        modernHeaders("tools/call", "upload_picture"),
      );
      return finished;
    }

    const png = await upload("application/octet-stream", PNG, pngDigest, "Binair");
    expect(((await png.json()) as { result: { content: { text: string }[] } }).result.content[0]?.text).toContain(
      "#1 Binair",
    );
    const pngImage = await app.request("https://jasmijnvink.com/pictures/1/image", {}, binding);
    expect(pngImage.headers.get("content-type")).toContain("image/png");
    const svg = await upload("text/plain", SVG, svgDigest, "Tekening");
    expect(((await svg.json()) as { result: { content: { text: string }[] } }).result.content[0]?.text).toContain(
      "#2 Tekening",
    );
    const svgImage = await app.request("https://jasmijnvink.com/pictures/2/image", {}, binding);
    expect(svgImage.headers.get("content-type")).toContain("image/svg+xml");
    const hidden = await app.request("https://jasmijnvink.com/pictures/2", {}, binding);
    expect(hidden.status).toBe(200);
  });
});
