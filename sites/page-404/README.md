# page-404

Default 404 page for unused subdomains on `*.tobys.cloud` and `*.toby.codes`.

Real sites keep **explicit DNS** (external-dns for k8s origins, Worker custom
domains for CF sites). This Worker only handles residual/wildcard traffic on
Cloudflare.

## Behaviour

- Returns the branded 404 HTML with status `404`
- If the request Host is `www.toby.codes` (still origin-hosted), passes through
  to origin so a `*.toby.codes` route cannot steal the blog

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
