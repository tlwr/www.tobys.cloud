export type AuthClientId = "auth" | "toby-codes" | "jvnl" | "utilityroom";

export type AuthClient = {
  id: AuthClientId;
  /** JWT `aud` and human label */
  label: string;
  permission: string;
  origins: string[];
};

export const AUTH_CLIENTS: Record<AuthClientId, AuthClient> = {
  auth: {
    id: "auth",
    label: "auth.tobys.cloud",
    permission: "auth:admin",
    origins: [
      "https://auth.tobys.cloud",
      "http://localhost:8788",
      "http://127.0.0.1:8788",
      "http://localhost",
      "http://127.0.0.1",
    ],
  },
  "toby-codes": {
    id: "toby-codes",
    label: "www.toby.codes",
    permission: "toby-codes:admin",
    origins: [
      "https://www.toby.codes",
      "https://toby.codes",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://localhost",
      "http://127.0.0.1",
    ],
  },
  jvnl: {
    id: "jvnl",
    label: "jasmijnvink.com",
    permission: "jvnl:admin",
    origins: [
      "https://jasmijnvink.com",
      "https://www.jasmijnvink.com",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://localhost",
      "http://127.0.0.1",
    ],
  },
  utilityroom: {
    id: "utilityroom",
    label: "utilityroom.club",
    permission: "utilityroom:admin",
    origins: [
      "https://utilityroom.club",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://localhost",
      "http://127.0.0.1",
    ],
  },
};

export const ALL_PERMISSIONS = Object.values(AUTH_CLIENTS).map(
  (c) => c.permission,
);

export function isAuthClientId(v: string): v is AuthClientId {
  return v in AUTH_CLIENTS;
}

export function originAllowed(client: AuthClientId, origin: string): boolean {
  return AUTH_CLIENTS[client].origins.includes(origin);
}
