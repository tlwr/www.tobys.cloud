import {
  getPicture,
  putPicture,
  type Picture,
} from "./pictures";

export const TAG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidTag(tag: string): boolean {
  return TAG_RX.test(tag);
}

function parseIdList(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

async function listAllTagKeys(kv: KVNamespace): Promise<string[]> {
  const tags: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await kv.list(cursor ? { cursor } : undefined);
    for (const key of page.keys) {
      if (isValidTag(key.name)) {
        tags.push(key.name);
      }
    }
    if (page.list_complete) {
      break;
    }
    cursor = page.cursor;
  }
  return tags.sort((a, b) => a.localeCompare(b));
}

export type TagRow = { tag: string; pictureIds: string[] };

export async function listTags(kv: KVNamespace): Promise<TagRow[]> {
  const names = await listAllTagKeys(kv);
  const out: TagRow[] = [];
  for (const tag of names) {
    out.push({ tag, pictureIds: parseIdList(await kv.get(tag)) });
  }
  return out;
}

async function writeTagIds(
  kv: KVNamespace,
  tag: string,
  ids: string[],
): Promise<void> {
  // Keep empty tags in the catalog (Rails did). Explicit deleteTag still removes them.
  const unique = [...new Set(ids)].sort((a, b) => Number(a) - Number(b));
  await kv.put(tag, JSON.stringify(unique));
}

export async function syncPictureTags(
  tagsKv: KVNamespace,
  pictureId: string,
  nextTags: string[],
  previousTags: string[] = [],
): Promise<void> {
  const next = new Set(nextTags.filter(isValidTag));
  const prev = new Set(previousTags.filter(isValidTag));

  for (const tag of next) {
    if (prev.has(tag)) {
      continue;
    }
    const ids = parseIdList(await tagsKv.get(tag));
    if (!ids.includes(pictureId)) {
      ids.push(pictureId);
    }
    await writeTagIds(tagsKv, tag, ids);
  }

  for (const tag of prev) {
    if (next.has(tag)) {
      continue;
    }
    const ids = parseIdList(await tagsKv.get(tag)).filter((id) => id !== pictureId);
    await writeTagIds(tagsKv, tag, ids);
  }
}

export async function createTag(
  kv: KVNamespace,
  tag: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "exists" }> {
  if (!isValidTag(tag)) {
    return { ok: false, reason: "invalid" };
  }
  const existing = await kv.get(tag);
  if (existing !== null) {
    return { ok: false, reason: "exists" };
  }
  await kv.put(tag, JSON.stringify([]));
  return { ok: true };
}

export async function getTagPictureIds(
  kv: KVNamespace,
  tag: string,
): Promise<string[] | null> {
  if (!isValidTag(tag)) {
    return null;
  }
  const raw = await kv.get(tag);
  if (raw === null) {
    return null;
  }
  return parseIdList(raw);
}

/**
 * Remove tag from KV and strip it from each picture's tags array.
 * Pictures themselves are kept.
 */
export async function deleteTag(
  picturesKv: KVNamespace,
  tagsKv: KVNamespace,
  tag: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "not_found" }> {
  if (!isValidTag(tag)) {
    return { ok: false, reason: "invalid" };
  }
  const raw = await tagsKv.get(tag);
  if (raw === null) {
    return { ok: false, reason: "not_found" };
  }
  const ids = parseIdList(raw);
  for (const id of ids) {
    const pic = await getPicture(picturesKv, id);
    if (!pic) {
      continue;
    }
    if (!pic.tags.includes(tag)) {
      continue;
    }
    const next: Picture = {
      ...pic,
      tags: pic.tags.filter((t) => t !== tag),
    };
    await putPicture(picturesKv, next);
  }
  await tagsKv.delete(tag);
  return { ok: true };
}
