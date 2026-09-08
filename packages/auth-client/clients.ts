export type AuthClientId = "auth" | "toby-codes" | "jvnl" | "utilityroom";

export type AuthClient = {
  id: AuthClientId;
  /** JWT `aud` and human label */
  label: string;
  permission: string;
  /** HTTPS origins allowed when the Worker request itself is not loopback. */
  origins: string[];
  /** Loopback origins allowed only when the Worker request is loopback. */
  devOrigins: string[];
};

const APP_DEV_ORIGINS = [
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  // Hono `app.request("/path")` defaults to `http://localhost` (no port).
  "http://localhost",
  "http://127.0.0.1",
];

const AUTH_DEV_ORIGINS = [
  "http://localhost:8788",
  "http://127.0.0.1:8788",
  "http://localhost",
  "http://127.0.0.1",
];

export const AUTH_CLIENTS: Record<AuthClientId, AuthClient> = {
  auth: {
    id: "auth",
    label: "auth.tobys.cloud",
    permission: "auth:admin",
    origins: ["https://auth.tobys.cloud"],
    devOrigins: AUTH_DEV_ORIGINS,
  },
  "toby-codes": {
    id: "toby-codes",
    label: "www.toby.codes",
    permission: "toby-codes:admin",
    origins: ["https://www.toby.codes", "https://toby.codes"],
    devOrigins: APP_DEV_ORIGINS,
  },
  jvnl: {
    id: "jvnl",
    label: "jasmijnvink.com",
    permission: "jvnl:admin",
    origins: ["https://jasmijnvink.com", "https://www.jasmijnvink.com"],
    devOrigins: APP_DEV_ORIGINS,
  },
  utilityroom: {
    id: "utilityroom",
    label: "utilityroom.club",
    permission: "utilityroom:admin",
    origins: ["https://utilityroom.club"],
    devOrigins: APP_DEV_ORIGINS,
  },
};

export const ALL_PERMISSIONS = Object.values(AUTH_CLIENTS).map(
  (c) => c.permission,
);

export function isAuthClientId(v: string): v is AuthClientId {
  return v in AUTH_CLIENTS;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      LOOPBACK_HOSTS.has(u.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * `requestOrigin` is the Worker handling the request (issuer or app).
 * Localhost redirect targets are accepted only when that Worker is loopback.
 */
export function originAllowed(
  client: AuthClientId,
  targetOrigin: string,
  requestOrigin: string,
): boolean {
  const cfg = AUTH_CLIENTS[client];
  const allowed = isLoopbackOrigin(requestOrigin)
    ? cfg.devOrigins
    : cfg.origins;
  return allowed.includes(targetOrigin);
}

export function redirectOriginAllowed(
  targetOrigin: string,
  requestOrigin: string,
): boolean {
  return (Object.keys(AUTH_CLIENTS) as AuthClientId[]).some((id) =>
    originAllowed(id, targetOrigin, requestOrigin),
  );
}
