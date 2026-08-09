import { describe, expect, it } from "vitest";
import worker from "./index";

describe("what-is-my-ip", () => {
  describe("plaintext", () => {
    it("returns dev when CF-Connecting-IP is missing", async () => {
      const resp = await worker.fetch(new Request("https://example.com/"));
      expect(resp.headers.get("Content-Type")).toBe("text/plain");
      expect(await resp.text()).toBe("dev");
    });

    it("returns the IP when CF-Connecting-IP is set", async () => {
      const resp = await worker.fetch(
        new Request("https://example.com/", {
          headers: { "CF-Connecting-IP": "1.2.3.4" },
        }),
      );
      expect(resp.headers.get("Content-Type")).toBe("text/plain");
      expect(await resp.text()).toBe("1.2.3.4");
    });
  });

  describe("json", () => {
    it("returns dev when CF-Connecting-IP is missing", async () => {
      const resp = await worker.fetch(
        new Request("https://example.com/", {
          headers: { Accept: "application/json" },
        }),
      );
      expect(resp.headers.get("Content-Type")).toContain("application/json");
      expect(await resp.json()).toEqual({ ip: "dev" });
    });

    it("returns the IP when CF-Connecting-IP is set", async () => {
      const resp = await worker.fetch(
        new Request("https://example.com/", {
          headers: {
            Accept: "application/json",
            "CF-Connecting-IP": "1.2.3.4",
          },
        }),
      );
      expect(resp.headers.get("Content-Type")).toContain("application/json");
      expect(await resp.json()).toEqual({ ip: "1.2.3.4" });
    });
  });
});
