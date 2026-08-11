export type Env = {
  ASSETS: Fetcher;
  USERS: KVNamespace;
  POSTS: KVNamespace;
  SESSION_SECRET?: string;
  NODE_ENV?: string;
};
