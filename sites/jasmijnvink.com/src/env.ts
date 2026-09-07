export type Env = {
  ASSETS: Fetcher;
  USERS: KVNamespace;
  PICTURES: KVNamespace;
  TAGS: KVNamespace;
  IMAGES: R2Bucket;
  SESSION_SECRET?: string;
  NODE_ENV?: string;
};
