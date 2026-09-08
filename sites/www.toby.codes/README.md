# www.toby.codes

Personal site for [Toby Lorne](https://www.toby.codes), on Cloudflare Workers
(Hono + marked). Markdown posts live in `posts/`; static files in `public/`.

Posts are stored in **POSTS** KV (`www-toby-codes-posts`). The repo `posts/`
directory is the git source of truth for bulk sync; the app prefers KV and
falls back to the generate-posts bundle if KV is empty.

## Auth

Login is centralised at [auth.tobys.cloud](https://auth.tobys.cloud). This
Worker redirects `/login` to the issuer, exchanges a short-lived JWT ticket at
`/auth/callback`, and stores a first-party `auth_session` cookie. Permission:
`toby-codes:admin`.

Login is **not** linked from the public nav; **Log out** appears when signed in.

| Route | Notes |
|-------|--------|
| `GET /login` | 302 to `auth.tobys.cloud/authorize` |
| `GET /auth/callback` | Ticket → session cookie |
| `GET`/`POST /logout` | Clears session, then issuer logout |

**`AUTH_JWT_SECRET` is required** and must match the auth Worker.

### Local secrets

```bash
# Creates .dev.vars with AUTH_JWT_SECRET (reuses auth.tobys.cloud if present)
npm run ensure-dev-vars
npm run push-posts -- --local
# In another terminal: cd ../auth.tobys.cloud && npm run dev
npm run dev
```

### Remote setup

```bash
# Same AUTH_JWT_SECRET that auth.tobys.cloud printed
npm run set-auth-jwt-secret -- '<secret>'

npm run push-posts -- --remote
npm run check-remote
npm run deploy
```

Create accounts and grant `toby-codes:admin` at https://auth.tobys.cloud.

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
| `npm run set-auth-jwt-secret` | Upload shared `AUTH_JWT_SECRET` → remote Worker |
| `npm run check-remote` | Assert secret + POSTS KV setup |
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
