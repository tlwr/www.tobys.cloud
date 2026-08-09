# assets.tobys.cloud

Shared static assets (CSS, fonts, favicon) served by a Cloudflare Worker.

Used by edge tools such as [pom.tobys.cloud](https://pom.tobys.cloud).

## Develop

```bash
npm ci
npm run dev
```

## Deploy

```bash
npm run deploy
```

Requires Cloudflare auth. Custom domain: `assets.tobys.cloud`.
