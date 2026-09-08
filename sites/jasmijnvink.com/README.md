# jasmijnvink.com

Port of the Rails `jvnl` photo site to a Cloudflare Worker (Hono). Dutch UI,
numeric `/pictures/:id` URLs, kebab-case tags, unlisted `/inloggen`.

## Storage

| Binding | Resource | Contents |
|---------|----------|----------|
| `PICTURES` | KV | integer id → picture JSON |
| `TAGS` | KV | kebab tag → JSON array of picture ids |
| `IMAGES` | R2 `jasmijnvink-com-images` | original bytes at `pictures/:id` |
| `ASSETS` | Worker static assets | CSS, fonts, favicon |

Auth is centralised at [auth.tobys.cloud](https://auth.tobys.cloud). Permission:
`jvnl:admin`. `AUTH_JWT_SECRET` must match the auth Worker.

## Develop

```bash
npm ci
npm run ensure-dev-vars
npm run dev
npm test
npm run typecheck
```

`/inloggen` redirects to the issuer. Create an account with `jvnl:admin` at
http://localhost:8788 (auth Worker, port 8788).

Create Cloudflare resources (once), then paste ids into `wrangler.toml`:

```bash
npx wrangler kv namespace create jasmijnvink-com-pictures --binding PICTURES --update-config
npx wrangler kv namespace create jasmijnvink-com-tags --binding TAGS --update-config
npx wrangler r2 bucket create jasmijnvink-com-images
```

## Deploy

```bash
npm run set-auth-jwt-secret -- '<same AUTH_JWT_SECRET as auth.tobys.cloud>'
npm run deploy
```

Import the live Rails sqlite + Active Storage tree (pictures/tags/images only;
users live on auth.tobys.cloud):

```bash
npm run import-from-rails -- --db ./import/production.sqlite3 --storage ./import/storage --remote
```

Hosts: `jasmijnvink.com` (apex) and `www.jasmijnvink.com` (301 → apex).
