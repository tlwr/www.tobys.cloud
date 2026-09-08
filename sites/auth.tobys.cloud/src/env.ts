export type Env = {
  USERS: KVNamespace;
  AUDIT: D1Database;
  AUTH_JWT_SECRET?: string;
};
