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
