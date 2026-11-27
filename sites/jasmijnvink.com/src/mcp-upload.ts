import { AwsClient } from "aws4fetch";
import type { Context } from "hono";
import { pictureCacheTags, purgePublic } from "./cache";
import type { Env } from "./env";
import {
  ALLOWED_TYPES,
  MAX_BYTES,
  nextPictureId,
  putPicture,
  r2KeyFor,
  type Picture,
} from "./pictures";
import { getTagPictureIds, isValidTag, syncPictureTags } from "./tags";

export const FILES_EXTENSION = "io.modelcontextprotocol/files";

/** Server advertisement. No `fetch` (we do not pull client-supplied URLs) and no `maxInlineBytes` (inline bytes are refused). */
export function filesCapability(): { upload: Record<string, never> } {
  return { upload: {} };
}

export class McpProtocolError extends Error {
  readonly code: number;
  readonly status: number;
  readonly data?: unknown;

  constructor(code: number, message: string, status = 200, data?: unknown) {
    super(message);
    this.name = "McpProtocolError";
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

const BUCKET = "jasmijnvink-com-images";
const UPLOAD_TTL_SECONDS = 30 * 60;
const STATE_TTL_SECONDS = 60 * 60;
const STATE_ID_RX = /^[A-Za-z0-9_-]{43}$/;
const OBJECT_KEY_RX = /^(staging|confirmed)\/[A-Za-z0-9_-]{43}$/;
const DIGEST_RX = /^[A-Za-z0-9_-]{43}$/;
const ACCOUNT_RX = /^[0-9a-f]{32}$/i;
const PROVISIONAL_TYPES = new Set<string>([
  ...ALLOWED_TYPES,
  "application/octet-stream",
  "text/plain",
]);

const UPLOAD_TOOL = {
  name: "upload_picture",
  description:
    "Upload a new picture to jasmijnvink.com. Requires a client that can send files with the MCP file uploads extension. The file must be a JPEG, PNG, GIF, WebP, or SVG of at most 10 MB. Give it a title. Tags must already exist; call list_tags first.",
  annotations: {
    title: "Upload picture",
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Picture title." },
      description: { type: "string" },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Existing kebab-case tags.",
      },
      visible: {
        type: "boolean",
        description: "Whether the picture is public. Defaults to true.",
      },
      file: {
        type: "object",
        description: "An image of up to 10 MB: JPEG, PNG, GIF, WebP, or SVG.",
        "x-mcp-file": {
          accept: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/svg+xml",
          ],
          maxSize: MAX_BYTES,
        },
        properties: {
          id: { type: "string", minLength: 1, maxLength: 128 },
          name: { type: "string" },
          mimeType: { type: "string" },
          size: { type: "integer", minimum: 0 },
          digest: {
            type: "object",
            properties: {
              algorithm: { const: "sha-256" },
              value: { type: "string" },
            },
            required: ["algorithm", "value"],
          },
        },
        required: ["id", "mimeType", "size", "digest"],
      },
    },
    required: ["title", "file"],
    additionalProperties: false,
  },
};

export function uploadPictureTool(): typeof UPLOAD_TOOL {
  return UPLOAD_TOOL;
}

type UploadRecord = {
  tool: "upload_picture";
  principal: string;
  arguments: Record<string, unknown>;
  stagingKey: string;
  confirmedKey: string;
  size: number;
  declaredType: string;
  digest: string;
  exp: number;
};

type FileFields = {
  id: string;
  mimeType: string;
  size: number;
  digest: string;
  data: unknown;
  source: unknown;
};

type Failure = { failure: Record<string, unknown> };

function textResult(text: string, isError = false): Record<string, unknown> {
  return {
    resultType: "complete",
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function fail(text: string): Failure {
  return { failure: textResult(text, true) };
}

function sourceDeclined(fileId: string, text: string): Failure {
  const result = textResult(text, true);
  if (fileId) {
    result._meta = {
      [FILES_EXTENSION]: {
        sourceErrors: [{ fileId, reason: "declined" }],
      },
    };
  }
  return { failure: result };
}

function invalidParams(message = "Invalid requestState."): never {
  throw new McpProtocolError(-32602, message);
}

function missingUpload(): never {
  throw new McpProtocolError(
    -32021,
    "This app can't send files to this connector, so the tool didn't run.",
    400,
    {
      requiredCapabilities: {
        extensions: { [FILES_EXTENSION]: { upload: {} } },
      },
    },
  );
}

function randomId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => jsonEqual(item, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord).sort();
  const bKeys = Object.keys(bRecord).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) {
    return false;
  }
  return aKeys.every((key) => jsonEqual(aRecord[key], bRecord[key]));
}

function signingConfig(
  env: Env,
): { accountId: string; accessKeyId: string; secretAccessKey: string } | null {
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? "";
  if (!ACCOUNT_RX.test(accountId) || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey };
}

async function presignPut(
  env: Env,
  key: string,
  contentType: string,
  size: number,
): Promise<string | null> {
  const config = signingConfig(env);
  if (!config || !OBJECT_KEY_RX.test(key)) {
    return null;
  }
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const url = new URL(
    `https://${config.accountId}.r2.cloudflarestorage.com/${BUCKET}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_TTL_SECONDS));
  const signed = await client.sign(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "If-None-Match": "*",
    },
    aws: { signQuery: true, allHeaders: true },
  });
  const target = signed.url.toString();
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }
  const signedHeaders = (parsed.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
  const covered = ["content-length", "content-type", "host", "if-none-match"].every((header) =>
    signedHeaders.includes(header),
  );
  if (
    !covered ||
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    target.length > 8192 ||
    parsed.searchParams.get("X-Amz-Expires") !== String(UPLOAD_TTL_SECONDS)
  ) {
    return null;
  }
  return target;
}

function readFile(args: Record<string, unknown>): FileFields | Failure {
  const file = args.file;
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    return fail("A picture file is required.");
  }
  const record = file as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  return {
    id,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : "",
    size: typeof record.size === "number" ? record.size : Number.NaN,
    digest: digestValue(record.digest),
    data: record.data,
    source: record.source,
  };
}

function digestValue(digest: unknown): string {
  if (!digest || typeof digest !== "object" || Array.isArray(digest)) {
    return "";
  }
  const record = digest as Record<string, unknown>;
  if (record.algorithm !== "sha-256" || typeof record.value !== "string") {
    return "";
  }
  return record.value;
}

type PictureFields = {
  title: string;
  description: string;
  visible: boolean;
  tags: string[];
};

function pictureFields(args: Record<string, unknown>): PictureFields | Failure {
  if (Object.keys(args).some((key) => !["title", "description", "tags", "visible", "file"].includes(key))) {
    return fail("Unexpected argument.");
  }
  if (typeof args.title !== "string" || !args.title.trim()) {
    return fail("Title is required.");
  }
  if (args.description !== undefined && typeof args.description !== "string") {
    return fail("Description must be text.");
  }
  if (args.visible !== undefined && typeof args.visible !== "boolean") {
    return fail("Visible must be true or false.");
  }
  let tags: string[] = [];
  if (args.tags !== undefined) {
    if (!Array.isArray(args.tags) || args.tags.some((tag) => typeof tag !== "string")) {
      return fail("Tags must be a list of names.");
    }
    tags = [...new Set(args.tags.map((tag) => tag.trim().toLowerCase()))];
    if (tags.some((tag) => !isValidTag(tag))) {
      return fail("Tags must be kebab-case.");
    }
  }
  return {
    title: args.title.trim(),
    description: typeof args.description === "string" ? args.description : "",
    visible: args.visible !== false,
    tags,
  };
}

async function knownTags(env: Env, tags: string[]): Promise<Failure | null> {
  for (const tag of tags) {
    if ((await getTagPictureIds(env.TAGS, tag)) === null) {
      return fail(`Unknown tag: ${tag}.`);
    }
  }
  return null;
}

function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(...bytes.subarray(0, 6));
    if (gif === "GIF87a" || gif === "GIF89a") {
      return "image/gif";
    }
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === "RIFF" && webp === "WEBP") {
      return "image/webp";
    }
  }
  const sample = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  const trimmed = sample.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

function typeMatches(declared: string, detected: string | null): detected is string {
  if (!detected || !ALLOWED_TYPES.has(detected)) {
    return false;
  }
  if (declared === "application/octet-stream" || declared === "text/plain") {
    return true;
  }
  return declared === detected;
}

function stateKey(id: string): string {
  return `mcp-upload:${id}`;
}

async function loadRecord(kv: KVNamespace, state: string): Promise<UploadRecord | null> {
  if (!STATE_ID_RX.test(state)) {
    return null;
  }
  const raw = await kv.get(stateKey(state));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<UploadRecord>;
    if (
      parsed.tool !== "upload_picture" ||
      typeof parsed.principal !== "string" ||
      !parsed.arguments ||
      typeof parsed.arguments !== "object" ||
      Array.isArray(parsed.arguments) ||
      typeof parsed.stagingKey !== "string" ||
      !OBJECT_KEY_RX.test(parsed.stagingKey) ||
      !parsed.stagingKey.startsWith("staging/") ||
      typeof parsed.confirmedKey !== "string" ||
      !OBJECT_KEY_RX.test(parsed.confirmedKey) ||
      !parsed.confirmedKey.startsWith("confirmed/") ||
      parsed.stagingKey.slice("staging/".length) !==
        parsed.confirmedKey.slice("confirmed/".length) ||
      !Number.isInteger(parsed.size) ||
      (parsed.size ?? 0) < 1 ||
      (parsed.size ?? 0) > MAX_BYTES ||
      typeof parsed.declaredType !== "string" ||
      typeof parsed.digest !== "string" ||
      !DIGEST_RX.test(parsed.digest) ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return parsed as UploadRecord;
  } catch {
    return null;
  }
}

async function consume(images: R2Bucket, state: string): Promise<"consumed" | "used" | "failed"> {
  // etagDoesNotMatch: "*" is the binding form of If-None-Match: *. The first
  // writer wins; a second retry sees the marker and is rejected.
  const key = `mcp-state/${state}`;
  try {
    const created = await images.put(key, "1", {
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (created) {
      return "consumed";
    }
  } catch {
    // A precondition failure can surface as null or as an exception.
  }
  const existing = await images.get(key);
  return existing ? "used" : "failed";
}

function fileNeedsUpload(file: FileFields): boolean {
  return file.size > 0 && file.data === undefined && file.source === undefined;
}

export async function uploadPicture(
  c: Context,
  principal: string,
  args: Record<string, unknown>,
  requestState: unknown,
  hasRequestState: boolean,
  uploadOk: boolean,
  origin: string,
): Promise<Record<string, unknown>> {
  const env = c.env as Env;
  const fileOrError = readFile(args);
  if ("failure" in fileOrError) {
    return fileOrError.failure;
  }
  const file = fileOrError;

  if (file.data !== undefined && file.source !== undefined) {
    return sourceDeclined(file.id, "A picture file cannot include both inline data and a source.").failure;
  }
  if (file.source !== undefined) {
    return sourceDeclined(
      file.id,
      "This server does not fetch files from a source. Send the picture with the upload flow instead.",
    ).failure;
  }
  if (file.data !== undefined) {
    return textResult(
      "This server does not accept inline file data. Declare upload and omit data so the picture can be sent out of band.",
      true,
    );
  }
  if (fileNeedsUpload(file) && !uploadOk) {
    missingUpload();
  }

  if (hasRequestState) {
    return finishUpload(c, env, principal, args, requestState, origin);
  }
  return beginUpload(env, principal, args, file);
}

async function beginUpload(
  env: Env,
  principal: string,
  args: Record<string, unknown>,
  file: FileFields,
): Promise<Record<string, unknown>> {
  const fieldsOrError = pictureFields(args);
  if ("failure" in fieldsOrError) {
    return fieldsOrError.failure;
  }
  const unknown = await knownTags(env, fieldsOrError.tags);
  if (unknown) {
    return unknown.failure;
  }
  if (!file.id || file.id.length > 128 || /[\u0000-\u001f\u007f]/.test(file.id)) {
    return textResult("The picture file id must be 1 to 128 characters.", true);
  }
  if (file.mimeType.length > 128 || !PROVISIONAL_TYPES.has(file.mimeType)) {
    return textResult("The picture must be a JPEG, PNG, GIF, WebP, or SVG.", true);
  }
  if (!Number.isInteger(file.size) || file.size < 0) {
    return textResult("The picture file size is invalid.", true);
  }
  if (file.size === 0) {
    return textResult("The picture file is empty.", true);
  }
  if (file.size > MAX_BYTES) {
    return textResult("The picture must be at most 10 MB.", true);
  }
  if (!DIGEST_RX.test(file.digest)) {
    return textResult("The picture digest must be a SHA-256 value in base64url.", true);
  }
  if (args.file && typeof args.file === "object" && !Array.isArray(args.file)) {
    const name = (args.file as Record<string, unknown>).name;
    if (name !== undefined && typeof name !== "string") {
      return textResult("The picture file name must be text.", true);
    }
  }

  const stateId = randomId();
  const objectId = randomId();
  const stagingKey = `staging/${objectId}`;
  const confirmedKey = `confirmed/${objectId}`;
  let target: string | null;
  try {
    target = await presignPut(env, stagingKey, file.mimeType, file.size);
  } catch {
    target = null;
  }
  if (!target) {
    return textResult("Picture upload is not configured on this server yet.", true);
  }

  const record: UploadRecord = {
    tool: "upload_picture",
    principal,
    arguments: args,
    stagingKey,
    confirmedKey,
    size: file.size,
    declaredType: file.mimeType,
    digest: file.digest,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  await env.PICTURES.put(stateKey(stateId), JSON.stringify(record), {
    expirationTtl: STATE_TTL_SECONDS,
  });

  return {
    resultType: "upload_required",
    content: [],
    uploads: [
      {
        fileId: file.id,
        url: target,
        method: "PUT",
        headers: {
          "Content-Type": file.mimeType,
          "If-None-Match": "*",
        },
        credentials: "omit",
        expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
      },
    ],
    requestState: stateId,
  };
}

async function finishUpload(
  c: Context,
  env: Env,
  principal: string,
  args: Record<string, unknown>,
  requestState: unknown,
  origin: string,
): Promise<Record<string, unknown>> {
  if (typeof requestState !== "string") {
    invalidParams();
  }
  const record = await loadRecord(env.PICTURES, requestState);
  if (!record || record.principal !== principal || !jsonEqual(record.arguments, args)) {
    invalidParams();
  }

  const object = await env.IMAGES.get(record.stagingKey);
  if (!object) {
    return textResult("The picture did not arrive. Send it to the upload URL, then retry.", true);
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  const storedSize = typeof object.size === "number" ? object.size : bytes.byteLength;
  if (storedSize !== record.size || bytes.byteLength !== record.size) {
    return textResult("The uploaded picture size does not match.", true);
  }
  const detected = detectImageType(bytes);
  if (!typeMatches(record.declaredType, detected)) {
    return textResult("The uploaded file is not an allowed image.", true);
  }
  const actualDigest = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  if (actualDigest !== record.digest) {
    return textResult("The uploaded picture digest does not match.", true);
  }

  const fieldsOrError = pictureFields(args);
  if ("failure" in fieldsOrError) {
    return fieldsOrError.failure;
  }
  const unknown = await knownTags(env, fieldsOrError.tags);
  if (unknown) {
    return unknown.failure;
  }

  try {
    await env.IMAGES.put(record.confirmedKey, bytes, {
      httpMetadata: { contentType: detected },
    });
  } catch {
    return textResult("The picture could not be saved.", true);
  }
  const consumed = await consume(env.IMAGES, requestState);
  if (consumed === "used") {
    invalidParams();
  }
  if (consumed !== "consumed") {
    return textResult("The picture could not be saved.", true);
  }

  try {
    const id = await nextPictureId(env.PICTURES);
    const r2Key = r2KeyFor(id);
    await env.IMAGES.put(r2Key, bytes, {
      httpMetadata: { contentType: detected },
    });
    const picture: Picture = {
      id,
      title: fieldsOrError.title,
      description: fieldsOrError.description,
      visible: fieldsOrError.visible,
      tags: fieldsOrError.tags,
      r2Key,
      contentType: detected,
      createdAt: new Date().toISOString(),
    };
    await putPicture(env.PICTURES, picture);
    await syncPictureTags(env.TAGS, id, fieldsOrError.tags, []);
    await purgePublic(c, pictureCacheTags(id, fieldsOrError.tags));
    const label = `#${id} ${fieldsOrError.title}`;
    return textResult(
      `Uploaded ${label}.\n${JSON.stringify({
        id,
        title: fieldsOrError.title,
        label,
        description: fieldsOrError.description,
        visible: fieldsOrError.visible,
        tags: fieldsOrError.tags,
        image: `${origin}/pictures/${id}/image`,
      })}`,
    );
  } catch {
    return textResult("The picture could not be saved.", true);
  }
}
