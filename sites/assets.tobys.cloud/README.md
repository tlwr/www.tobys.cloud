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

Requires Cloudflare auth and a proxied DNS record for `assets.tobys.cloud`
on the `tobys.cloud` zone (Worker route: `assets.tobys.cloud/*`).

### Routing note

`page-404` owns `*.tobys.cloud/*`. Zone **Routes** take precedence over
**Custom Domains**, so this site must use an explicit route
`assets.tobys.cloud/*` (more specific than the wildcard). Same idea as
`nines.tobys.cloud/*` / `pom.tobys.cloud/*`.
