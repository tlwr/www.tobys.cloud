import { describe, expect, it } from "vitest";
import { isStaticAssetPath } from "../../../packages/static-asset-path/index";

describe("isStaticAssetPath", () => {
  it("allows the static files these sites actually serve", () => {
    for (const path of [
      "/styles.css",
      "/favicon.ico",
      "/robots.txt",
      "/cv.pdf",
      "/zeilbootje.stl",
      "/images/sidecar-manager.png",
      "/images/bosh-learning-curve.jpg",
      "/fonts/BerkeleyMono-Regular.woff2",
      "/BerkeleyMono-Bold.woff",
    ]) {
      expect(isStaticAssetPath(path), path).toBe(true);
    }
  });

  it("allows mischiefs pages only when listed exactly", () => {
    expect(isStaticAssetPath("/", ["/", "/index.html", "/404.html"])).toBe(true);
    expect(isStaticAssetPath("/index.html", ["/", "/index.html", "/404.html"])).toBe(
      true,
    );
    expect(isStaticAssetPath("/")).toBe(false);
    expect(isStaticAssetPath("/index.html")).toBe(false);
  });

  it("rejects scanner paths, including encoded ones", () => {
    for (const path of [
      "/.env",
      "/.env.old",
      "/.env.staging",
      "/api/.env",
      "/.pypirc",
      "/.git/config",
      "/.git-credentials",
      "/wp-admin/install.php",
      "/ioxi-o.php",
      "/xmlrpc.php",
      "//sito/wp-includes/wlwmanifest.xml",
      "/actuator/env",
      "/debug/vars",
      "/%2f%2eenv",
      "/%2f%2eaws%2fcredentials",
      "/styles.css%00.php",
      "/styles.css%2ephp",
      "/%2e%2e/styles.css",
      "/images/foo.png/../.env",
    ]) {
      expect(isStaticAssetPath(path), path).toBe(false);
    }
  });
});
