import { describe, expect, it } from "vitest";
import {
  isValidTag,
  normalizeTags,
  parsePost,
  rewriteFrontmatter,
} from "./frontmatter";

describe("parsePost", () => {
  it("defaults visible true without frontmatter", () => {
    const p = parsePost("# Hello\n\nWorld");
    expect(p.frontmatter.visible).toBe(true);
    expect(p.frontmatter.tags).toEqual([]);
    expect(p.body).toBe("# Hello\n\nWorld");
    expect(p.raw).toBe("# Hello\n\nWorld");
  });

  it("parses visible: false and strips fence from body", () => {
    const raw = `---
visible: false
---
# Draft

Secret.
`;
    const p = parsePost(raw);
    expect(p.frontmatter.visible).toBe(false);
    expect(p.body).toBe("# Draft\n\nSecret.\n");
    expect(p.raw).toBe(raw);
    expect(p.body).not.toContain("visible:");
    expect(p.body).not.toContain("---");
  });

  it("parses visible: true", () => {
    const p = parsePost(`---
visible: true
---
# Hi
`);
    expect(p.frontmatter.visible).toBe(true);
    expect(p.body).toBe("# Hi\n");
  });

  it("parses tags inline and as list", () => {
    const inline = parsePost(`---
visible: true
tags: workers, Cloudflare
---
# A
`);
    expect(inline.frontmatter.tags).toEqual(["cloudflare", "workers"]);

    const bracket = parsePost(`---
tags: [go-lang, rust]
---
# B
`);
    expect(bracket.frontmatter.tags).toEqual(["go-lang", "rust"]);

    const list = parsePost(`---
tags:
  - foo-bar
  - baz
---
# C
`);
    expect(list.frontmatter.tags).toEqual(["baz", "foo-bar"]);
  });

  it("validates kebab-case tags", () => {
    expect(isValidTag("cloudflare")).toBe(true);
    expect(isValidTag("go-lang")).toBe(true);
    expect(isValidTag("Not-Valid")).toBe(false);
    expect(isValidTag("has_underscore")).toBe(false);
    expect(normalizeTags(["OK", "bad Tag", "good-tag"])).toEqual([
      "good-tag",
      "ok",
    ]);
  });

  it("rewrites frontmatter tags", () => {
    const raw = `---
visible: true
tags: old-tag
---
# Body
`;
    const next = rewriteFrontmatter(raw, { tags: ["new-tag", "other"] });
    const p = parsePost(next);
    expect(p.frontmatter.tags).toEqual(["new-tag", "other"]);
    expect(p.frontmatter.visible).toBe(true);
    expect(p.body).toBe("# Body\n");
  });
});
