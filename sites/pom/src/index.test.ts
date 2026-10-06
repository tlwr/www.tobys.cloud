import { describe, expect, it } from "vitest";
import worker from "./index";

describe("pom", () => {
  it("shows the timer form on /", async () => {
    const res = await worker.fetch(new Request("https://pom.tobys.cloud/"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('name="minutes"');
  });

  it("starts a timer from a form post", async () => {
    const res = await worker.fetch(
      new Request("https://pom.tobys.cloud/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "minutes=25",
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(
      /^https:\/\/pom\.tobys\.cloud\/\d+$/,
    );
  });

  it("renders /done and a numeric countdown", async () => {
    const done = await worker.fetch(new Request("https://pom.tobys.cloud/done"));
    expect(done.status).toBe(200);
    expect(await done.text()).toContain("done");

    const countdown = await worker.fetch(
      new Request("https://pom.tobys.cloud/1700000000000"),
    );
    expect(countdown.status).toBe(200);
    expect(await countdown.text()).toContain("1700000000000");
  });

  it("404s scanner paths instead of returning the form", async () => {
    for (const path of ["/wp-admin/install.php", "/done.php", "/gecko-new.php"]) {
      const res = await worker.fetch(new Request(`https://pom.tobys.cloud${path}`));
      expect(res.status, path).toBe(404);
      expect(await res.text()).toBe("Not found");
    }
  });

  it("does not parse a non-form POST", async () => {
    const res = await worker.fetch(
      new Request(
        "https://pom.tobys.cloud/flowise/api/v1/node-load-method/customMCP",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      ),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("rejects a POST to / that is not a form", async () => {
    const res = await worker.fetch(
      new Request("https://pom.tobys.cloud/", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "minutes=25",
      }),
    );
    expect(res.status).toBe(415);
  });
});
