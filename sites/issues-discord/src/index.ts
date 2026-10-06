interface Env {
  DISCORD_WEBHOOK_URL: string;
  WEBHOOK_AUTH: string;
}

const DISCORD_WEBHOOK =
  /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/[^/]+\/[^/\s]+$/;

const LOW_RISK_SCAN =
  /Potential vulnerability scan · [^'\n]+ · low risk/;

const DISCORD_CONTENT_LIMIT = 2000;

export function isLowRiskVulnerabilityScan(text: string): boolean {
  return LOW_RISK_SCAN.test(text);
}

function alertTexts(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as {
      text?: unknown;
      content?: unknown;
      embeds?: { title?: unknown; description?: unknown }[];
    };
    const texts: string[] = [];
    if (typeof parsed.text === "string") texts.push(parsed.text);
    if (typeof parsed.content === "string") texts.push(parsed.content);
    for (const embed of parsed.embeds ?? []) {
      if (typeof embed?.title === "string") texts.push(embed.title);
      if (typeof embed?.description === "string") texts.push(embed.description);
    }
    if (texts.length > 0) return texts;
  } catch {
    // Cloudflare also sends a plain-text body for some destinations.
  }
  return [body];
}

function secretMatches(expected: string, provided: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(provided);
  const length = Math.max(a.byteLength, b.byteLength);
  if (length === 0) return false;
  let diff = a.byteLength ^ b.byteLength;
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const provided = request.headers.get("cf-webhook-auth") ?? "";
    if (!secretMatches(env.WEBHOOK_AUTH ?? "", provided)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.text();
    if (alertTexts(body).some(isLowRiskVulnerabilityScan)) {
      return new Response(null, { status: 204 });
    }

    const webhook = env.DISCORD_WEBHOOK_URL ?? "";
    if (!DISCORD_WEBHOOK.test(webhook)) {
      return new Response("Discord webhook is not configured", { status: 500 });
    }

    const text = alertTexts(body).join("\n\n");
    const discord = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: text.slice(0, DISCORD_CONTENT_LIMIT),
        allowed_mentions: { parse: [] },
      }),
    });

    if (!discord.ok) {
      return new Response("Discord rejected the notification", { status: 502 });
    }
    return new Response(null, { status: 204 });
  },
};
