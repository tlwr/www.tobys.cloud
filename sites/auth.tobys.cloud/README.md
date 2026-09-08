# auth.tobys.cloud

Central login + primitive RBAC for Worker sites. Email + bcrypt in **USERS** KV.
Apps redirect here, receive a short-lived HMAC JWT ticket, then set a first-party session cookie.

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
npm run set-auth-jwt-secret   # prints AUTH_JWT_SECRET — set that same value on each app
npm run seed-remote -- toby@toby.codes 'your-password'
npm run deploy
```

Apps need `AUTH_JWT_SECRET` (same value) and `AUTH_ISSUER=https://auth.tobys.cloud`.
