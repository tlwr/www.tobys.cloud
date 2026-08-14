export type Env = {
  ASSETS: Fetcher;
  USERS: KVNamespace;
  POSTS: KVNamespace;
  /** Tag → JSON array of post slugs. */
  TAGS: KVNamespace;
  SESSION_SECRET?: string;
  NODE_ENV?: string;
};
