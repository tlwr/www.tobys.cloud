export type Env = {
  ASSETS: Fetcher;
  PICTURES: KVNamespace;
  TAGS: KVNamespace;
  IMAGES: R2Bucket;
  /** Licensed webfonts in the shared tobys-cloud-fonts bucket. */
  FONTS: R2Bucket;
  AUTH_JWT_SECRET?: string;
  AUTH_ISSUER?: string;
  NODE_ENV?: string;
  /**
   * S3 API credentials for pre-signed upload URLs. The R2 binding cannot
   * sign those URLs. Absent until an operator sets the Worker secrets.
   */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
};
