# assets.tobys.cloud

Shared static assets (CSS, favicon) served by a Cloudflare Worker. Webfonts are not in this directory or in git. They live in the `tobys-cloud-fonts` R2 bucket and are synced with `node tools/fonts.mjs` from the repo root (`just fonts-pull` / `just fonts-push`).

`/v1/toby.css` is the current sheet (it imports `/v1/tokens.css`). `/styles.css` is the previous sheet and stays until every consumer has moved. The style guide is `/v1`.

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
