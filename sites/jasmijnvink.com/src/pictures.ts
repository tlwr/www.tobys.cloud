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
const INDEX_KEY = "pictures:index";

type PictureSummary = {
  id: string;
  title: string;
  description: string;
  visible: boolean;
  tags: string[];
};

function summaryOf(picture: Picture): PictureSummary {
  return {
    id: picture.id,
    title: picture.title,
    description: picture.description,
    visible: picture.visible,
    tags: picture.tags,
  };
}

function pictureFromSummary(summary: PictureSummary): Picture {
  return {
    ...summary,
    r2Key: r2KeyFor(summary.id),
    contentType: "application/octet-stream",
    createdAt: "",
  };
}

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

async function readIndex(kv: KVNamespace): Promise<PictureSummary[] | null> {
  const raw = await kv.get(INDEX_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { pictures?: PictureSummary[] };
    if (!parsed || !Array.isArray(parsed.pictures)) {
      return null;
    }
    return parsed.pictures.filter((p) => p && ID_RX.test(p.id));
  } catch {
    return null;
  }
}

async function writeIndex(kv: KVNamespace, pictures: PictureSummary[]): Promise<void> {
  await kv.put(INDEX_KEY, JSON.stringify({ pictures }));
}

async function rebuildIndex(kv: KVNamespace): Promise<PictureSummary[]> {
  const ids = await listAllIds(kv);
  const pictures: PictureSummary[] = [];
  for (const id of ids) {
    const picture = await getPicture(kv, id);
    if (picture) {
      pictures.push(summaryOf(picture));
    }
  }
  await writeIndex(kv, pictures);
  return pictures;
}

async function loadIndex(kv: KVNamespace): Promise<PictureSummary[]> {
  return (await readIndex(kv)) ?? (await rebuildIndex(kv));
}

export async function putPicture(
  kv: KVNamespace,
  picture: Picture,
): Promise<void> {
  if (!ID_RX.test(picture.id)) {
    throw new Error("invalid picture id");
  }
  await kv.put(picture.id, JSON.stringify(picture));
  const current = await loadIndex(kv);
  const next = current.filter((p) => p.id !== picture.id);
  next.push(summaryOf(picture));
  await writeIndex(kv, next);
}

export async function deletePicture(
  kv: KVNamespace,
  id: string,
): Promise<void> {
  await kv.delete(id);
  const current = await readIndex(kv);
  if (!current) {
    return;
  }
  await writeIndex(
    kv,
    current.filter((p) => p.id !== id),
  );
}

/** Newest id first (Rails order(id: :desc)). One KV read via `pictures:index`. */
export async function listPictures(
  kv: KVNamespace,
  options: { includeHidden?: boolean } = {},
): Promise<Picture[]> {
  const includeHidden = options.includeHidden === true;
  const summaries = await loadIndex(kv);
  const out = summaries
    .filter((p) => includeHidden || p.visible)
    .map(pictureFromSummary);
  out.sort((a, b) => Number(b.id) - Number(a.id));
  return out;
}

export async function nextPictureId(kv: KVNamespace): Promise<string> {
  const summaries = await loadIndex(kv);
  let max = 0;
  for (const picture of summaries) {
    const n = Number(picture.id);
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
