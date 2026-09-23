import type { Context } from "hono";

/** Baseline headers. Nonce covers inline scripts; event handlers stay on script-src-attr. */
export function securityHeaders(nonce: string): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' https://cdnjs.cloudflare.com 'nonce-${nonce}'`,
      "script-src-attr 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://assets.tobys.cloud",
      "img-src 'self' data: https: https://assets.tobys.cloud",
      "font-src 'self' https://assets.tobys.cloud",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

/** HTML and JSON only. Rewrapping a stylesheet or a 304 throws and can cache the error. */
export function applySecurityHeaders(c: Context, nonce: string): void {
  const status = c.res.status;
  if (status === 204 || status === 304 || status === 101) {
    return;
  }
  const type = c.res.headers.get("content-type") ?? "";
  const isDocument =
    type.includes("text/html") ||
    type.includes("application/json") ||
    type.startsWith("text/plain") ||
    type === "";
  if (!isDocument) {
    return;
  }
  const headers = new Headers(c.res.headers);
  for (const [name, value] of Object.entries(securityHeaders(nonce))) {
    headers.set(name, value);
  }
  c.res = new Response(c.res.body, {
    status,
    statusText: c.res.statusText,
    headers,
  });
}
