# vink.club

Static pages for [vink.club](https://vink.club), served by a Cloudflare Worker.

- `GET /` and any other path return plaintext `vink.club`
- `GET /pensioen-feestje` returns the party page

Later apps can take a prefix by handling that path before the plaintext default.

## Develop

```bash
npm ci
npm run dev
```

## Deploy

```bash
npm run deploy
```

Requires Cloudflare auth (`wrangler login` or API token). Custom domains:

- `vink.club`
- `www.vink.club` (301 → apex)
