import { describe, expect, it } from "vitest";
import { parsePost } from "./frontmatter";

describe("parsePost", () => {
  it("defaults visible true without frontmatter", () => {
    const p = parsePost("# Hello\n\nWorld");
    expect(p.frontmatter.visible).toBe(true);
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
});
