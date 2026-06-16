# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-06-16

First release of the rebuilt client for the **Smobilpay S3P partner API
(v3.x)**. This is a major, breaking rewrite of the `2.x` line — see
*Migration from 2.x* below.

### Added

- **OAuth 2.0 `client_credentials` authentication.** The client mints a
  bearer token via `POST /oauth/token` (HTTP Basic `publicKey:secretKey`),
  caches it in memory until expiry (minus `tokenRefreshSkewMs`), and
  coalesces concurrent requests onto a single in-flight token mint.
  Inspect or force-refresh via `client.tokens`.
- **Full coverage of the `/v2/*` partner endpoints**, grouped by spec tag:
  `client.verify` (ping, account, verifytx, historystd),
  `client.masterdata` (merchant, service, product, voucher, topup, cashin,
  cashout), `client.initiate` (bill, subscription, quotestd),
  `client.confirm` (collectstd), and `client.accountValidation`
  (verify, validate).
- **JSON request bodies** for write operations (`/v2/quotestd`,
  `/v2/collectstd`).
- **`x-api-version` request header** (default `3.0.0`). Under this version
  the server rewrites a collection `SUCCESS` to `PENDING`; poll
  `/v2/verifytx` or await the `callbackUrl` webhook for the final status.
- **Typed error hierarchy** — `SmobilpayError` with `SmobilpayAuthException`
  (OAuth token issuance failures, carrying `httpStatus` + OAuth `error`)
  and `SmobilpayApiException` (any non-2xx `/v2/*` response, carrying
  `httpStatus`, `apiError`, `respCode`, `rawBody`).
- **Read-only smoke test** (`npm run smoke`) exercising every endpoint
  against a real partner environment without moving money unless a flow
  block explicitly opts in with `collect: true`.

### Changed

- **Minimum runtime is now Node.js 18+**, using the built-in `fetch`,
  `node:test`, and `AbortController`.
- **Zero runtime dependencies.**

### Removed

- **HMAC-SHA1 request signing** — the legacy `2.x` authentication scheme is
  deliberately not implemented. Partners must be provisioned with OAuth
  `client_credentials`.

### Migration from 2.x

Legacy partners that still authenticate with HMAC-SHA1 should **stay on the
`2.x` line** (`npm install @maviance/smobilpay-s3p-client@^2`) until they
are issued OAuth credentials. `3.x` is OAuth-only and is not
wire-compatible with the HMAC auth scheme.

[3.0.0]: https://github.com/maviance/smobilpay-s3p-client-nodejs/releases/tag/v3.0.0
