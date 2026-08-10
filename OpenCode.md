# OpenCode Guidelines

## Build, Lint, Test Commands

Sites under `sites/` are Cloudflare Workers (Node/TypeScript). From each site directory:

- **Install**: `npm ci`
- **Dev**: `npm run dev`
- **Typecheck**: `npm run typecheck`
- **Test** (where present): `npm test`
- **Deploy**: `npm run deploy`

Acceptance tests (Ruby / live sites):

- `make acceptance-tests` — `cd acceptance && bundle exec rspec`
- Image build/push: `make build-acceptance-tests` / `make push-acceptance-tests`

## Code Style Guidelines

- Prefer TypeScript with `strict` for Workers.
- Keep site packages self-contained (`package.json` per site under `sites/`).
- Error handling: fail closed on missing content; return proper HTTP status codes.
