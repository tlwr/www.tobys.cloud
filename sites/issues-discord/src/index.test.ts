import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { isLowRiskVulnerabilityScan } from "./index";

const env = {
  DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/123/token",
  WEBHOOK_AUTH: "test-secret",
};

function post(body: string, auth = "test-secret"): Request {
  return new Request("https://issues-discord.tobys.cloud/", {
    method: "POST",
    headers: { "cf-webhook-auth": auth, "content-type": "application/json" },
    body,
  });
}

describe("isLowRiskVulnerabilityScan", () => {
  it("matches a low-risk scan title", () => {
    expect(
      isLowRiskVulnerabilityScan(
        "Real-Time Issue 'Potential vulnerability scan · secret-files · low risk' detected in mischiefs.",
      ),
    ).toBe(true);
  });

  it("leaves high-risk scans and other issues alone", () => {
    expect(
      isLowRiskVulnerabilityScan(
        "Real-Time Issue 'Potential vulnerability scan · secret-files · high risk' detected in www-toby-codes.",
      ),
    ).toBe(false);
    expect(
      isLowRiskVulnerabilityScan(
        "Real-Time Issue 'HttpServerError · HTTP 500' detected in www-toby-codes.",
      ),
    ).toBe(false);
  });
});

describe("issues-discord", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops a low-risk scan without calling Discord", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      post(
        JSON.stringify({
          text: "Real-Time Issue 'Potential vulnerability scan · wordpress · low risk' detected in vink-club.",
        }),
      ),
      env,
    );
    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a high-risk scan and an exception", async () => {
    let forwarded = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      forwarded = String(init?.body ?? "");
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const text =
      "Real-Time Issue 'HttpServerError · HTTP 500' detected in www-toby-codes.";
    const response = await worker.fetch(
      post(JSON.stringify({ text })),
      env,
    );
    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(forwarded)).toEqual({
      content: text,
      allowed_mentions: { parse: [] },
    });
  });

  it("rejects a missing or wrong webhook secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({
      text: "Real-Time Issue 'HttpServerError · HTTP 500' detected in pom.",
    });
    expect((await worker.fetch(post(body, ""), env)).status).toBe(401);
    expect((await worker.fetch(post(body, "nope"), env)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-POST", async () => {
    const response = await worker.fetch(
      new Request("https://issues-discord.tobys.cloud/"),
      env,
    );
    expect(response.status).toBe(405);
  });
});
