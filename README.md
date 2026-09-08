# www.tobys.cloud

Cloudflare Worker sites in `sites/`, shared packages in `packages/`.
Site relationships and tasks live in `catalog.json`; run them from the repo
root with [just](https://github.com/casey/just) (`brew install just`).

```bash
just sites                              # catalog
just test auth jvnl                     # aliases ok
just deploy auth.tobys.cloud www.toby.codes jasmijnvink.com utilityroom.club
just deploy-all
just ci-affected                        # vs origin/main, or BASE=<sha>
just deploy-affected
```

Aliases: `auth`, `toby`, `jvnl`, `utilityroom`, `assets`, `ip`.

`just deploy` is local on purpose (uses your Wrangler login). GitHub Actions
runs `just ci` for affected sites only; it does not deploy.

Acceptance tests (Ruby / Nomad) stay in the `Makefile`.
