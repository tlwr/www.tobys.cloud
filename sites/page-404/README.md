# page-404

Default 404 page for unused subdomains on `*.tobys.cloud` and `*.toby.codes`.

Real sites keep **explicit DNS** (Worker zone routes / custom domains). This
Worker only handles residual/wildcard traffic on Cloudflare. More specific
routes (e.g. `www.toby.codes/*`) take precedence.

## Behaviour

- Returns the branded 404 HTML with status `404`

## Develop

```bash
npm ci
npm run dev
```

## Deploy

```bash
npm run deploy
```

Requires zone access for `tobys.cloud` and `toby.codes`.

## Cluster notes

After removal from k8s:

- HAProxy default backend is `sites/www-toby-codes` (unmatched LB traffic no
  longer gets this page — rare if only explicit hosts are published)
- `tobys.cloud` / `www.tobys.cloud` redirect Ingress uses `www-toby-codes` as a
  dummy backend for the redirect annotation
