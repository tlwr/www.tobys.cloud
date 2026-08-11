export type Env = {
  ASSETS: Fetcher;
  USERS: KVNamespace;
  SESSION_SECRET?: string;
  NODE_ENV?: string;
};
