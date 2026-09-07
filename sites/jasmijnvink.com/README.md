# jasmijnvink.com

Port of the Rails `jvnl` photo site to a Cloudflare Worker (Hono). Dutch UI,
numeric `/pictures/:id` URLs, kebab-case tags, unlisted `/inloggen`.

## Storage

| Binding | Resource | Contents |
|---------|----------|----------|
| `USERS` | KV | email → `{ username, hashedPassword }` (bcrypt, Devise-compatible) |
| `PICTURES` | KV | integer id → picture JSON |
| `TAGS` | KV | kebab tag → JSON array of picture ids |
| `IMAGES` | R2 `jasmijnvink-com-images` | original bytes at `pictures/:id` |
| `ASSETS` | Worker static assets | CSS, fonts, favicon |

`SESSION_SECRET` is required (no fallback).

## Develop

```bash
npm ci
npm run ensure-dev-vars
npm run seed-local
npm run dev
npm test
npm run typecheck
```

Default local user: `jasmijn@example.com` / `secret`.

Create Cloudflare resources (once), then paste ids into `wrangler.toml`:

```bash
npx wrangler kv namespace create jasmijnvink-com-users --binding USERS --update-config
npx wrangler kv namespace create jasmijnvink-com-pictures --binding PICTURES --update-config
npx wrangler kv namespace create jasmijnvink-com-tags --binding TAGS --update-config
npx wrangler r2 bucket create jasmijnvink-com-images
```

## Deploy

```bash
npm run set-session-secret
npm run seed-remote -- 'email@example.com' 'password'
npm run deploy
```

Or import the live Rails sqlite + Active Storage tree (preserves ids):

```bash
kubectl -n jasmijn cp <pod>:/pvc/sqlite/production.sqlite3 ./import/production.sqlite3
kubectl -n jasmijn cp <pod>:/pvc/storage ./import/storage
npm run import-from-rails -- --db ./import/production.sqlite3 --storage ./import/storage --remote
```

Hosts: `jasmijnvink.com` (apex) and `www.jasmijnvink.com` (301 → apex).
