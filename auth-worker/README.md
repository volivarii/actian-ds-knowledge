# Auth Worker — GitHub OAuth Broker

A tiny Cloudflare Worker that brokers the GitHub OAuth authorization-code exchange for the Knowledge Editor. The editor SPA cannot perform the exchange itself (GitHub's token endpoint requires `client_secret` and lacks CORS even after the July 2025 PKCE update). The Worker holds the secret server-side, completes the exchange, and posts the token back to the SPA via origin-locked `postMessage`.

Vendored from [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) (MIT). See `src/index.ts` for the pinned upstream SHA and any local modifications.

## Architecture

```
[Editor SPA] → github.com/login/oauth/authorize
                       ↓ (user approves)
                Worker /callback?code
                       ↓
                Worker → github.com/login/oauth/access_token (with client_secret)
                       ↓
                Worker → postMessage(token, allowed-origin) → SPA
```

## Initial deploy runbook

_To be populated in Task A3 with actual recorded values._

## Secret rotation

_To be populated in Task A3._

## Ownership transfer (volivarii → Actian org)

_To be populated in Task A3._
