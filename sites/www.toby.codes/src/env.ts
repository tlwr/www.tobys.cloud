export type Env = {
  ASSETS: Fetcher;
  POSTS: KVNamespace;
  TAGS: KVNamespace;
  AUTH_JWT_SECRET?: string;
  AUTH_ISSUER?: string;
  NODE_ENV?: string;
};
