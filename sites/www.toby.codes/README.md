# www.toby.codes

Personal site for [Toby Lorne](https://www.toby.codes), on Cloudflare Workers
(Hono + marked). Markdown posts live in `posts/`; static files in `public/`.

Posts are stored in **POSTS** KV (`www-toby-codes-posts`). The repo `posts/`
directory is the git source of truth for bulk sync; the app prefers KV and
falls back to the generate-posts bundle if KV is empty.

## Auth

Multi-user login (utilityroom-style): bcrypt hashes in **USERS** KV
(`www-toby-codes-users`), signed session cookies, CSRF on all routes. Login is
**not** linked from the public nav; **Log out** appears when signed in.

| Route | Notes |
|-------|--------|
| `GET /login` | Form (`noindex`) |
| `POST /login` | Sets session cookies |
| `GET`/`POST /logout` | Clears session |

`requireAuth` middleware is exported from `src/auth.ts` for future editor routes.

**`SESSION_SECRET` is required** (no insecure fallback). Without it, login fails.

### Local secrets

```bash
# Creates .dev.vars with a random SESSION_SECRET if missing (also runs on npm run dev)
npm run ensure-dev-vars
npm run seed-local
npm run push-posts -- --local
npm run dev
```

### Remote setup

```bash
# Generate a random secret and upload it (does not print the value after)
npm run set-session-secret

# Seed a user into production KV
npm run seed-remote -- toby 'your-password'

# Sync posts/*.md → remote POSTS KV
npm run push-posts -- --remote

# Verify secrets + KV match what the app expects
npm run check-remote

npm run deploy
```

### Posts sync

```bash
# Repo → KV
npm run push-posts -- --local
npm run push-posts -- --remote

# KV → repo (after browser edits; then git commit)
npm run pull-posts -- --local
npm run pull-posts -- --remote
```

### Tools

| Script | Purpose |
|--------|---------|
| `npm run seed-local` | Put user in local Miniflare KV (defaults: toby / secret) |
| `npm run seed-remote` | Put user in remote `www-toby-codes-users` |
| `npm run set-session-secret` | Crypto-random `SESSION_SECRET` → remote Worker |
| `npm run check-remote` | Assert secret + USERS/POSTS KV setup |
| `npm run push-posts` | Sync `posts/*.md` → POSTS KV (`--local` \| `--remote`) |
| `npm run pull-posts` | Sync POSTS KV → `posts/*.md` (`--local` \| `--remote`) |

## Develop

```bash
npm ci
npm run dev
npm test
npm run typecheck
```

## Deploy

```bash
npm run deploy
```

Hosts:

- `www.toby.codes` — Custom Domain (DNS) + zone route `www.toby.codes/*`
- `toby.codes` — same for apex

Zone-only routes do **not** create DNS records; `custom_domain = true` does.
The `/*` zone routes stay so this Worker beats page-404’s `*.toby.codes/*`.
