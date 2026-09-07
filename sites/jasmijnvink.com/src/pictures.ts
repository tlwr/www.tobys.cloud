export type Picture = {
  id: string;
  title: string;
  description: string;
  visible: boolean;
  tags: string[];
  r2Key: string;
  contentType: string;
  createdAt: string;
};

export const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export const MAX_BYTES = 10 * 1024 * 1024;

const ID_RX = /^\d+$/;

export function isValidPictureId(id: string): boolean {
  return ID_RX.test(id);
}

export function r2KeyFor(id: string): string {
  return `pictures/${id}`;
}

function parsePicture(raw: string | null): Picture | null {
  if (!raw) {
    return null;
  }
  try {
    const p = JSON.parse(raw) as Picture;
    if (!p || typeof p.id !== "string" || typeof p.title !== "string") {
      return null;
    }
    return {
      id: p.id,
      title: p.title,
      description: typeof p.description === "string" ? p.description : "",
      visible: p.visible !== false,
      tags: Array.isArray(p.tags)
        ? p.tags.filter((t): t is string => typeof t === "string")
        : [],
      r2Key: typeof p.r2Key === "string" ? p.r2Key : r2KeyFor(p.id),
      contentType:
        typeof p.contentType === "string" ? p.contentType : "application/octet-stream",
      createdAt:
        typeof p.createdAt === "string" ? p.createdAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

async function listAllIds(kv: KVNamespace): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await kv.list(cursor ? { cursor } : undefined);
    for (const key of page.keys) {
      if (ID_RX.test(key.name)) {
        ids.push(key.name);
      }
    }
    if (page.list_complete) {
      break;
    }
    cursor = page.cursor;
  }
  return ids;
}

export async function getPicture(
  kv: KVNamespace,
  id: string,
): Promise<Picture | null> {
  if (!ID_RX.test(id)) {
    return null;
  }
  return parsePicture(await kv.get(id));
}

export async function putPicture(
  kv: KVNamespace,
  picture: Picture,
): Promise<void> {
  if (!ID_RX.test(picture.id)) {
    throw new Error("invalid picture id");
  }
  await kv.put(picture.id, JSON.stringify(picture));
}

export async function deletePicture(
  kv: KVNamespace,
  id: string,
): Promise<void> {
  await kv.delete(id);
}

/** Newest id first (Rails order(id: :desc)). */
export async function listPictures(
  kv: KVNamespace,
  options: { includeHidden?: boolean } = {},
): Promise<Picture[]> {
  const includeHidden = options.includeHidden === true;
  const ids = await listAllIds(kv);
  const out: Picture[] = [];
  for (const id of ids) {
    const p = await getPicture(kv, id);
    if (!p) {
      continue;
    }
    if (!includeHidden && !p.visible) {
      continue;
    }
    out.push(p);
  }
  out.sort((a, b) => Number(b.id) - Number(a.id));
  return out;
}

export async function nextPictureId(kv: KVNamespace): Promise<string> {
  const ids = await listAllIds(kv);
  let max = 0;
  for (const id of ids) {
    const n = Number(id);
    if (n > max) {
      max = n;
    }
  }
  return String(max + 1);
}

export function validateImage(
  type: string,
  size: number,
): string | null {
  if (!ALLOWED_TYPES.has(type)) {
    return "Afbeelding moet een afbeelding zijn (JPEG, PNG, GIF, WebP, SVG)";
  }
  if (size > MAX_BYTES) {
    return "Afbeelding mag niet groter zijn dan 10MB";
  }
  return null;
}
