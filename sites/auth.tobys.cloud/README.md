# auth.tobys.cloud

Central login + primitive RBAC for Worker sites. Email + bcrypt in **USERS** KV.
Apps redirect here, receive a short-lived HMAC JWT ticket, then set a first-party session cookie.

Audit events (login success/failure, logout, user create) go to a **D1** log
(`/audit`, newest first). `email` is the subject; `actor` is who did it (user
create). D1 is the right store here — KV list is not time-ordered.

## Permissions

| Permission | Site |
|------------|------|
| `auth:admin` | this admin UI |
| `toby-codes:admin` | www.toby.codes editor |
| `jvnl:admin` | jasmijnvink.com |
| `utilityroom:admin` | utilityroom.club |

## Develop

```bash
npm ci
npm run ensure-dev-vars
npm run seed-local
npm run dev   # port 8788
```

Create the KV namespace, put real id in `wrangler.toml`, then:

```bash
npx wrangler kv namespace create auth-tobys-cloud-users --binding USERS --update-config
npx wrangler d1 create auth-tobys-cloud-audit
# paste database_id into wrangler.toml, then:
npm run db:migrate
npm run set-auth-jwt-secret   # writes AUTH_JWT_SECRET to .dev.vars
npm run seed-remote -- toby@toby.codes 'your-password'
npm run deploy
```

Apps need `AUTH_JWT_SECRET` (same value) and `AUTH_ISSUER=https://auth.tobys.cloud`.
