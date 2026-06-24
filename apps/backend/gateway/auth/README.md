# Gateway Auth

Authentication and authorization modules for the API gateway.

## Features

- **Password auth** — bcrypt password hashing, JWT access tokens (15 min), rotating refresh tokens (7 days) with family revocation on reuse detection.
- **OAuth2 / OpenID Connect** — Google and GitHub social login with automatic Stellar wallet provisioning for new users. _(issue #66)_
- **JWT middleware** — `extractAuth(req)` verifies Bearer tokens for protected routes.
- **Rate limiting** — Redis-backed per-endpoint limits (stricter on auth endpoints).

---

## OAuth2 / OpenID Connect

### Overview

The OAuth flow uses the authorization code grant without Passport or an OIDC library — the project runs a raw Node HTTP server, so provider calls are made directly with the native `fetch` API.

```
Browser → GET /api/v1/auth/oauth/:provider
        ← 302 redirect to provider authorization URL

Provider → GET /api/v1/auth/oauth/:provider/callback?code=...&state=...
         ← 200/201 JSON  { data: { user, accessToken, expiresIn, isNewUser }, error: null }
                   + Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict
```

### Supported Providers

| Provider | Grant type | Scopes |
|----------|-----------|--------|
| Google   | Authorization code + OIDC | `openid email profile` |
| GitHub   | Authorization code | `read:user user:email` |

### Environment Variables

Add these to your `.env` (see `.env.example` for a template):

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes (Google) | OAuth2 client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Yes (Google) | OAuth2 client secret |
| `GITHUB_CLIENT_ID` | Yes (GitHub) | OAuth2 client ID from [GitHub Developer Settings](https://github.com/settings/developers) |
| `GITHUB_CLIENT_SECRET` | Yes (GitHub) | OAuth2 client secret |
| `OAUTH_CALLBACK_BASE_URL` | Yes | Base URL for the redirect URI, e.g. `https://api.delego.io` (no trailing slash). Must match what is registered in the provider console exactly. |
| `JWT_SECRET` | Yes | Shared secret for access tokens **and** OAuth state JWTs. |
| `STELLAR_NETWORK` | No | `testnet` (default) or `mainnet`. Controls which network the auto-provisioned wallet is associated with. |

### Provider Console Setup

**Google**
1. Create a project at https://console.cloud.google.com
2. Enable the _Google Identity_ API.
3. Create an OAuth 2.0 Client ID (Web Application).
4. Add `{OAUTH_CALLBACK_BASE_URL}/api/v1/auth/oauth/google/callback` as an authorised redirect URI.

**GitHub**
1. Go to _Settings → Developer settings → OAuth Apps → New OAuth App_.
2. Set the Authorization callback URL to `{OAUTH_CALLBACK_BASE_URL}/api/v1/auth/oauth/github/callback`.

### User Registration & Account Linking

When a social login arrives, the callback follows this lookup order:

1. **Existing OAuth link** (`oauth_accounts.provider + provider_user_id`) → load owner user, update profile fields, issue tokens. No new rows created.
2. **Existing email, no prior link** → link the OAuth identity to the existing local user (merges accounts with the same verified email).
3. **Brand-new email** → create a new `users` row (with `password_hash = NULL`), create the `oauth_accounts` link, and auto-provision a Stellar wallet.

All three steps run inside a single Sequelize transaction.

### Stellar Wallet Provisioning

For brand-new OAuth users a Stellar keypair is generated with `@stellar/stellar-sdk`'s `Keypair.random()`. The public key is stored in the `wallets` table and written to `users.stellar_address`. The private key is **not** stored in the gateway — key custody is the wallet service's responsibility. If a wallet already exists the provisioning step is skipped (idempotent).

### CSRF Protection

The OAuth `state` parameter is a short-lived JWT (10 minutes) signed with `JWT_SECRET`. The provider embeds it in the callback URL and the callback handler verifies the signature and the embedded provider name before processing the code. No server-side session is required.

### Response Envelope

Success (new user):
```json
HTTP 201
{
  "data": {
    "user": { "id": "...", "email": "...", "displayName": "...", "avatarUrl": "...", "stellarAddress": "G..." },
    "accessToken": "eyJ...",
    "expiresIn": 900,
    "isNewUser": true
  },
  "error": null
}
Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/
```

Success (returning user):
```json
HTTP 200
{ "data": { ... "isNewUser": false }, "error": null }
```

Error responses follow the standard envelope `{ "data": null, "error": { "code": "...", "message": "..." } }`.

| HTTP | `error.code` | Cause |
|------|-------------|-------|
| 400 | `OAUTH_ACCESS_DENIED` | User denied access at provider |
| 400 | `VALIDATION_ERROR` | Missing `code` or `state` params |
| 400 | `OAUTH_STATE_MISMATCH` | State JWT invalid, expired, or provider mismatch |
| 400 | `OAUTH_PROVIDER_ERROR` | Unsupported provider in URL |
| 502 | `OAUTH_PROVIDER_ERROR` | Token exchange or userinfo fetch failed |
| 503 | `OAUTH_CONFIG_ERROR` | Provider credentials not configured in environment |

### Refresh Token Flow

OAuth logins reuse the same refresh-token rotation system as password logins (`generateTokens`, `refreshAccessToken`). The refresh token is an HttpOnly cookie and supports token family revocation on reuse detection.

---

## Database Migration

Run `pnpm db:migrate` after pulling this change. The migration `004_oauth_accounts.sql` creates:

- `oauth_accounts` table (`id`, `user_id`, `provider`, `provider_user_id`, `email`, `display_name`, `avatar_url`, timestamps)
- Unique constraint on `(provider, provider_user_id)`
- Indexes on `user_id`, `provider`, and `(provider, provider_user_id)`
- Adds `avatar_url TEXT` column to `users`

The migration is safe to run against existing data — all `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`.

---

## Running Tests

```bash
# From the repo root — runs all unit tests including OAuth
pnpm test:unit

# From the gateway package — runs only gateway tests
cd apps/backend/gateway
pnpm build   # compile TypeScript first
pnpm test
```

The OAuth unit tests (`tests/unit/src/oauth.test.js`) are fully offline — they stub `globalThis.fetch` and Sequelize model methods; no database or network is required.
