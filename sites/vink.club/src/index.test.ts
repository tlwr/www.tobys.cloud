import { describe, expect, it } from "vitest";
import worker from "./index";

describe("vink.club", () => {
  it("returns plaintext on /", async () => {
    const resp = await worker.fetch(new Request("https://vink.club/"));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("text/plain");
    expect(await resp.text()).toBe("vink.club");
  });

  it("returns plaintext on an unknown path", async () => {
    const resp = await worker.fetch(new Request("https://vink.club/ergens"));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("text/plain");
    expect(await resp.text()).toBe("vink.club");
  });

  it("returns the party page", async () => {
    const resp = await worker.fetch(
      new Request("https://vink.club/pensioen-feestje"),
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const html = await resp.text();
    expect(html).toContain("Pensioenfeestje");
    expect(html).toContain("Lorem ipsum");
  });

  it("accepts a trailing slash on the party page", async () => {
    const resp = await worker.fetch(
      new Request("https://vink.club/pensioen-feestje/"),
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("text/html");
  });

  it("redirects www to the apex", async () => {
    const resp = await worker.fetch(
      new Request("https://www.vink.club/pensioen-feestje?x=1"),
    );
    expect(resp.status).toBe(301);
    expect(resp.headers.get("Location")).toBe(
      "https://vink.club/pensioen-feestje?x=1",
    );
  });
});
