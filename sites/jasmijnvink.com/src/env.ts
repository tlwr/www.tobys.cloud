export type Env = {
  ASSETS: Fetcher;
  PICTURES: KVNamespace;
  TAGS: KVNamespace;
  IMAGES: R2Bucket;
  AUTH_JWT_SECRET?: string;
  AUTH_ISSUER?: string;
  NODE_ENV?: string;
};
