import { describe, expect, it } from "vitest";
import { getPostMarkdown, listPosts } from "./posts";

describe("posts", () => {
  it("lists ongoing and dated posts without .md", () => {
    const { ongoing, dated } = listPosts();
    expect(ongoing.length).toBeGreaterThan(0);
    expect(dated.length).toBeGreaterThan(0);

    const fosdem = dated.find((p) => p.slug === "2020-02-FOSDEM-2020");
    expect(fosdem).toBeDefined();
    expect(fosdem?.title).toContain("FOSDEM");
    expect(fosdem?.date).toBe("2020-02");

    for (const p of [...ongoing, ...dated]) {
      expect(p.slug).not.toContain(".md");
    }
  });

  it("loads a known post body", () => {
    const md = getPostMarkdown("2020-02-FOSDEM-2020");
    expect(md).toBeTruthy();
    expect(md).toContain("Eurostar");
  });

  it("returns null for missing posts", () => {
    expect(getPostMarkdown("does-not-exist")).toBeNull();
    expect(getPostMarkdown("../etc/passwd")).toBeNull();
  });
});
