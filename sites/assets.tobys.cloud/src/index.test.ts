import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index";

function assets() {
  const fetched: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (input: RequestInfo) => {
        const req = new Request(input);
        fetched.push(`${new URL(req.url).pathname} ${req.method}`);
        expect(req.headers.get("If-None-Match")).toBeNull();
        return new Response("body{color:red}", {
          status: 200,
          headers: { "content-type": "text/css" },
        });
      },
    },
  };
  return { env: env as unknown as Env, fetched };
}

describe("assets.tobys.cloud", () => {
  it("serves a static file and adds CORS", async () => {
    const { env, fetched } = assets();
    const res = await worker.fetch(
      new Request("https://assets.tobys.cloud/styles.css", {
        headers: { "If-None-Match": '"poison"' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.text()).toContain("color:red");
    expect(fetched).toEqual(["/styles.css GET"]);
  });

  it("does not fetch scanner paths", async () => {
    const { env, fetched } = assets();
    const res = await worker.fetch(
      new Request("https://assets.tobys.cloud/.env", { method: "HEAD" }),
      env,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(fetched).toEqual([]);
  });

  it("answers OPTIONS for a static file without fetching it", async () => {
    const { env, fetched } = assets();
    const res = await worker.fetch(
      new Request("https://assets.tobys.cloud/BerkeleyMono-Regular.woff2", {
        method: "OPTIONS",
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(fetched).toEqual([]);
  });
});
