# mischiefs.nl

Static landing page for [mischiefs.nl](https://mischiefs.nl), served by a Cloudflare Worker.

## Develop

```bash
npm ci
npm run dev
```

## Typecheck

```bash
npm run typecheck
```

## Deploy

```bash
npm run deploy
```

Requires Cloudflare auth (`wrangler login` or API token). Custom domains:

- `mischiefs.nl`
- `www.mischiefs.nl` (301 → apex)
