# www.toby.codes

Personal site for [Toby Lorne](https://www.toby.codes), on Cloudflare Workers
(Hono + marked). Markdown posts live in `posts/`; static files in `public/`.

Post storage is file-backed for now so an editor (like utilityroom.club) can
later write to KV/R2 without changing public routes.

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
