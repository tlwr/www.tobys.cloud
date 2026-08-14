export type PostFrontmatter = {
  /** Default true when omitted. */
  visible: boolean;
  /** Kebab-case tags (normalized, unique, sorted). */
  tags: string[];
};

export type ParsedPost = {
  frontmatter: PostFrontmatter;
  /** Markdown body without the frontmatter block. */
  body: string;
  /** Original document including frontmatter (for storage/editor). */
  raw: string;
};

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Kebab-case: lowercase alphanumerics separated by single hyphens. */
export const TAG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidTag(tag: string): boolean {
  return TAG_RX.test(tag);
}

/** Normalize and filter to valid unique sorted kebab-case tags. */
export function normalizeTags(raw: string[]): string[] {
  const out = new Set<string>();
  for (const t of raw) {
    const tag = t.trim().toLowerCase();
    if (isValidTag(tag)) {
      out.add(tag);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/**
 * Parse optional YAML-like frontmatter. Recognizes `visible` and `tags`.
 * Missing frontmatter ⇒ visible: true, tags: [].
 */
export function parsePost(raw: string): ParsedPost {
  const match = raw.match(FENCE);
  if (!match) {
    return {
      frontmatter: { visible: true, tags: [] },
      body: raw,
      raw,
    };
  }

  const yaml = match[1];
  const body = match[2] ?? "";
  let visible = true;
  const tagParts: string[] = [];

  const lines = yaml.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const visibleMatch = trimmed.match(/^visible\s*:\s*(.+)$/i);
    if (visibleMatch) {
      visible = parseBool(visibleMatch[1].trim());
      continue;
    }

    // tags: [a, b]  |  tags: a, b  |  tags:
    const tagsInline = trimmed.match(/^tags\s*:\s*(.*)$/i);
    if (tagsInline) {
      const rest = tagsInline[1].trim();
      if (rest) {
        tagParts.push(...parseTagsValue(rest));
      } else {
        // Multi-line list: following "- item" lines
        while (i + 1 < lines.length) {
          const next = lines[i + 1].trim();
          if (!next || next.startsWith("#")) {
            i++;
            continue;
          }
          const listItem = next.match(/^-\s+(.+)$/);
          if (!listItem) {
            break;
          }
          tagParts.push(stripQuotes(listItem[1].trim()));
          i++;
        }
      }
      continue;
    }
  }

  return {
    frontmatter: {
      visible,
      tags: normalizeTags(tagParts),
    },
    body,
    raw,
  };
}

/**
 * Rewrite frontmatter `visible` + `tags` while keeping the body.
 * Only known fields are written (drops unknown YAML keys).
 */
export function rewriteFrontmatter(
  raw: string,
  opts: { visible?: boolean; tags?: string[] },
): string {
  const parsed = parsePost(raw);
  const visible = opts.visible ?? parsed.frontmatter.visible;
  const tags = opts.tags ?? parsed.frontmatter.tags;
  const lines = ["---", `visible: ${visible ? "true" : "false"}`];
  if (tags.length > 0) {
    lines.push(`tags: ${tags.join(", ")}`);
  }
  lines.push("---", "");
  return lines.join("\n") + parsed.body;
}

function parseTagsValue(value: string): string[] {
  let v = value.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    v = v.slice(1, -1);
  }
  if (!v) {
    return [];
  }
  return v.split(",").map((s) => stripQuotes(s.trim()));
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
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
