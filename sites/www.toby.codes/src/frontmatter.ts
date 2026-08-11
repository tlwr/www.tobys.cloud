export type PostFrontmatter = {
  /** Default true when omitted. */
  visible: boolean;
};

export type ParsedPost = {
  frontmatter: PostFrontmatter;
  /** Markdown body without the frontmatter block. */
  body: string;
  /** Original document including frontmatter (for storage/editor). */
  raw: string;
};

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse optional YAML-like frontmatter. Only `visible` is recognized today.
 * Missing frontmatter ⇒ visible: true.
 */
export function parsePost(raw: string): ParsedPost {
  const match = raw.match(FENCE);
  if (!match) {
    return {
      frontmatter: { visible: true },
      body: raw,
      raw,
    };
  }

  const yaml = match[1];
  const body = match[2] ?? "";
  let visible = true;

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const m = trimmed.match(/^visible\s*:\s*(.+)$/i);
    if (m) {
      visible = parseBool(m[1].trim());
    }
  }

  return {
    frontmatter: { visible },
    body,
    raw,
  };
}

function parseBool(value: string): boolean {
  const v = value.replace(/^["']|["']$/g, "").toLowerCase();
  if (["false", "no", "0", "off"].includes(v)) {
    return false;
  }
  if (["true", "yes", "1", "on"].includes(v)) {
    return true;
  }
  // Unknown values default to visible so we don't hide by accident.
  return true;
}
