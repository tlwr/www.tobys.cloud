import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index";

function assets() {
  const fetched: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (input: RequestInfo) => {
        const url = new URL(new Request(input).url);
        fetched.push(url.pathname);
        if (url.pathname === "/404.html") {
          return new Response("<h2>404</h2>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              etag: '"page"',
            },
          });
        }
        return new Response("file", {
          status: 200,
          headers: { "content-type": "text/css", etag: '"file"' },
        });
      },
    },
  };
  return { env: env as unknown as Env, fetched };
}

describe("mischiefs", () => {
  it("redirects www to the apex without fetching assets", async () => {
    const { env, fetched } = assets();
    const res = await worker.fetch(
      new Request("https://www.mischiefs.nl/wp-admin/install.php"),
      env,
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://mischiefs.nl/wp-admin/install.php",
    );
    expect(fetched).toEqual([]);
  });

  it("fetches real pages and static files", async () => {
    const { env, fetched } = assets();
    const home = await worker.fetch(new Request("https://mischiefs.nl/"), env);
    const css = await worker.fetch(
      new Request("https://mischiefs.nl/styles.css"),
      env,
    );
    expect(home.status).toBe(200);
    expect(css.status).toBe(200);
    expect(fetched).toEqual(["/", "/styles.css"]);
  });

  it("answers scanner paths with 404.html and does not fetch the probe", async () => {
    const { env, fetched } = assets();
    const res = await worker.fetch(
      new Request("https://mischiefs.nl/wp-admin/install.php", {
        headers: { "If-None-Match": '"poison"' },
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("404");
    expect(res.headers.get("etag")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(fetched).toEqual(["/404.html"]);
  });
});
