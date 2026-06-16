# @maviance/smobilpay-s3p-client

Node.js client for the **Smobilpay S3P partner API (v3.x)**. Authenticates
with OAuth 2.0 `client_credentials`, covers every `/v2/*` endpoint from
the partner specification, and ships with zero runtime dependencies.

## Requirements

- Node.js **18 or later** (uses the built-in `fetch`, `node:test`, and `AbortController`).
- Partner credentials (`publicKey` / `secretKey`) and an issued `baseUrl`.

Credentials and the base URL are provisioned during partner onboarding.
The same credentials are accepted across the acceptance and production
environments — only the URL changes.

## Install

```bash
npm install @maviance/smobilpay-s3p-client
# or
yarn add @maviance/smobilpay-s3p-client
# or
pnpm add @maviance/smobilpay-s3p-client
```

## Quick start

```js
const {
  createClient,
  SmobilpayApiException,
} = require('@maviance/smobilpay-s3p-client');

const client = createClient({
  baseUrl: process.env.SMOBILPAY_BASE_URL,        // e.g. https://api.acceptance.example.invalid
  publicKey: process.env.SMOBILPAY_PUBLIC_KEY,
  secretKey: process.env.SMOBILPAY_SECRET_KEY,
});

try {
  const pong = await client.verify.ping();
  console.log(pong.version, pong.time);

  const merchants = await client.masterdata.merchants();
  console.log(`${merchants.length} merchants`);
} catch (e) {
  if (e instanceof SmobilpayApiException) {
    console.error('respCode', e.respCode, 'devMsg', e.apiError?.devMsg);
  } else {
    throw e;
  }
}
```

The returned `client` is **stateless apart from the cached OAuth token**
and is intended to be reused for the lifetime of your application
(thread/async safe; concurrent requests coalesce onto a single in-flight
token mint).

## Authentication

This client supports **OAuth 2.0 `client_credentials` only**. HMAC-SHA1
signing (used by the legacy `2.x` clients) is deliberately not
implemented — partners migrating from the legacy auth scheme must be
provisioned with OAuth credentials.

> **Still on HMAC?** Stay on the prior major of this client until you are
> issued OAuth credentials — install `@maviance/smobilpay-s3p-client@^2`
> (`npm install @maviance/smobilpay-s3p-client@^2`). The `2.x` line keeps
> HMAC-SHA1 signing for legacy partners; `3.x` is OAuth-only.

On the first authenticated request the client:

1. Calls `POST /oauth/token` with HTTP Basic auth (`publicKey:secretKey`)
   and `grant_type=client_credentials`.
2. Caches the returned bearer token in memory until
   `now + tokenRefreshSkewMs >= expiresAt`.
3. Attaches `Authorization: Bearer …` and `x-api-version: 3.0.0` on every
   `/v2/*` request.

You can inspect or force-refresh the cached token via `client.tokens`:

```js
await client.tokens.accessToken();   // current bearer; mints if expired
await client.tokens.refresh();       // force a fresh mint
client.tokens.cachedToken();         // { accessToken, tokenType, expiresAt }
```

Failures during token issuance throw `SmobilpayAuthException`; the
exception carries `httpStatus` and the OAuth standard `error` identifier
(`invalid_client`, `unsupported_grant_type`, etc.).

## Configuration

```js
createClient({
  baseUrl: 'https://api.acceptance.example.invalid',  // required
  publicKey: '…',                                              // required
  secretKey: '…',                                              // required
  apiVersion: '3.0.0',                                         // default '3.0.0'
  requestTimeoutMs: 30_000,                                    // default 30s
  tokenRefreshSkewMs: 30_000,                                  // default 30s
  fetch: undefined,                                            // override (tests)
});
```

The returned config object is frozen. To get a config without
constructing a client (e.g. to inspect defaults), call `createConfig`
directly.

## API reference

The client surfaces each partner-spec tag as a property on the returned
client. Every method returns a `Promise` resolving to the response body
(or `null` for `204` responses).

### `client.verify` — Verify

| Method | HTTP | Description |
| --- | --- | --- |
| `ping()` | `GET /v2/ping` | Authenticated round-trip probe |
| `account()` | `GET /v2/account` | Authenticated agent's account profile |
| `verifyTransaction(ptn, trid)` | `GET /v2/verifytx` | Current status of a previously-issued collection |
| `historyByPtn(ptn)` | `GET /v2/historystd` | Lookup by payment transaction number |
| `historyByTrid(trid)` | `GET /v2/historystd` | Lookup by caller's transaction reference |
| `historyByDateRange(from, to)` | `GET /v2/historystd` | Inclusive UTC date range; accepts `Date` instances or ISO-8601 strings |

### `client.masterdata` — Masterdata

| Method | HTTP | Description |
| --- | --- | --- |
| `merchants()` | `GET /v2/merchant` | Every merchant supported by the system |
| `services()` | `GET /v2/service` | Every service supported by the system |
| `products(serviceid?)` | `GET /v2/product` | Purchasable products, optionally filtered |
| `vouchers(serviceid?)` | `GET /v2/voucher` | Purchasable vouchers |
| `topups(serviceid?)` | `GET /v2/topup` | Top-up packages |
| `cashins(serviceid?)` | `GET /v2/cashin` | Disbursement (money INTO recipient) packages |
| `cashouts(serviceid?)` | `GET /v2/cashout` | Collection (money OUT of customer) packages |

### `client.initiate` — Initiate

| Method | HTTP | Description |
| --- | --- | --- |
| `bills(merchant, serviceid, serviceNumber)` | `GET /v2/bill` | Search bills by service number |
| `subscriptions(merchant, serviceid, serviceNumber, customerNumber)` | `GET /v2/subscription` | Search subscriptions; pass *one* of `serviceNumber` or `customerNumber` |
| `quote({ amount, payItemId })` | `POST /v2/quotestd` | Request a price quote for a payment collection |

### `client.confirm` — Confirm

| Method | HTTP | Description |
| --- | --- | --- |
| `collect(request)` | `POST /v2/collectstd` | Execute a payment collection against an unexpired quote |

`request` shape — see `src/api/confirm.js` for full JSDoc:

```js
client.confirm.collect({
  quoteId: '…',                  // required (from a prior quote)
  customerPhonenumber: '…',      // required
  customerEmailaddress: '…',     // required
  customerName: undefined,       // optional — required if Service.isReqCustomerName
  customerAddress: undefined,    // optional — required if Service.isReqCustomerAddress
  customerNumber: undefined,     // optional — required if Service.isReqCustomerNumber
  serviceNumber: undefined,      // optional — required if Service.isReqServiceNumber
  trid: undefined,               // optional — caller's transaction reference
  tag: undefined,                // optional — max 50 chars
  callbackUrl: undefined,        // optional — max 255 chars
  cdata: undefined,              // optional — custom data echoed on the response
});
```

> When the request header `x-api-version: 3.0.0` is set, the server
> rewrites `SUCCESS` to `PENDING` on the collection response. Poll
> `/v2/verifytx` or wait for the `callbackUrl` webhook to learn the
> final status.

### `client.accountValidation` — Account Validation

| Method | HTTP | Description |
| --- | --- | --- |
| `verifyServiceNumber(merchant, serviceid, serviceNumber)` | `GET /v2/verify` | Validate a service number; returns `Promise<boolean>` |
| `validateAccount(destination, serviceId)` | `GET /v2/validate` | Validate an MSISDN/contract; returns a `CustomerAccount` envelope |

> `GET /v2/validate` is a **restricted endpoint**. Access is granted
> only to partners who have completed the provider's compliance review
> (KYC / data-protection obligations apply to the returned customer
> name). Unauthorised callers receive HTTP 401 — the client surfaces
> this as a `SmobilpayApiException` with `httpStatus === 401`.

## Error handling

Every failure is a subclass of `SmobilpayError` and can be matched with
`instanceof`:

```js
const {
  SmobilpayError,
  SmobilpayAuthException,   // OAuth token issuance failures
  SmobilpayApiException,    // any /v2/* non-2xx response
} = require('@maviance/smobilpay-s3p-client');

try {
  await client.initiate.quote({ amount: 500, payItemId: 'PI-1' });
} catch (e) {
  if (e instanceof SmobilpayApiException) {
    // The canonical machine identifier per the partner spec.
    if (e.respCode === 498) console.warn('quote expired — re-quote and retry');
    else if (e.respCode === 41004) console.warn('service does not support this operation');
    else throw e;
  } else if (e instanceof SmobilpayAuthException) {
    // 401 invalid_client, 400 unsupported_grant_type, 502/504, …
    console.error('auth failure', e.httpStatus, e.oauthError);
    throw e;
  } else {
    throw e;
  }
}
```

`SmobilpayApiException` carries:

- `httpStatus` — the HTTP status of the failed response.
- `apiError` — the parsed `ApiError` envelope (`{ respCode, devMsg, usrMsg, link }`),
  or `null` when the server returned no body / a non-JSON body.
- `respCode` — short-hand accessor for `apiError?.respCode`.
- `rawBody` — the raw response body for diagnostics.

Match on `respCode` for programmatic handling — it is the canonical
machine identifier defined by the partner spec. The full error catalogue
is published with the partner specification.

## Date handling

`historyByDateRange(from, to)` accepts either `Date` instances or
ISO-8601 strings, including the bare `"YYYY-MM-DD"` form (treated as the
start of that UTC day). The client serialises the request as
`timestamp_from=YYYY-MM-DDT00:00:00+00:00` and
`timestamp_to=YYYY-MM-DDT23:59:59+00:00`, matching the wire format
required by the partner spec.

## Smoke test

A read-only / quote-only smoke test exercises every endpoint against a
real partner environment without moving money (it never calls
`/v2/collectstd`).

```bash
cp smoke-test.example.json smoke-test.json
# Edit smoke-test.json with your baseUrl, publicKey, secretKey, and the
# per-flow blocks you want exercised.
npm run smoke
# Or with an explicit config path:
node samples/smoke-test.js path/to/my-config.json
```

The smoke test:

1. Pings the server (proves OAuth + bearer + `x-api-version` work).
2. Forces a token refresh, re-pings.
3. Reads the account profile.
4. Lists merchants and services.
5. For every configured flow (cashout / bill / topup / voucher /
   product / subscription / cashin) — discovers a payment item and
   requests a quote.
6. **Opt-in:** if the flow block sets `collect: true`, the harness also
   executes `/v2/collectstd` against the issued quote and polls
   `/v2/verifytx` once to surface the latest server-side status. See
   *"Running a real collect"* below — leave disabled in CI.
7. Optionally verifies a service number and validates a destination.
8. Pulls the last 7 days of history.

### Running a real collect

Each collection-style flow block in `smoke-test.json` accepts an
opt-in set of fields to actually call `POST /v2/collectstd`. The smoke
test never moves money by accident — collect only fires when the block
explicitly sets `collect: true` AND provides the required customer
fields.

```jsonc
{
  "cashin": {
    "serviceId": 50052,
    "amount": 1000,
    "collect": true,
    "customerPhonenumber": "699999999",
    "customerEmailaddress": "you@example.com",
    "serviceNumber": "699999999"      // when the service has isReqServiceNumber=true
  }
}
```

Required when `collect: true`:

- `customerPhonenumber` — payer's MSISDN for collections, **recipient's MSISDN for cash-in**.
- `customerEmailaddress` — used for receipts (acceptance does not actually email).

Optional pass-through fields, forwarded only when present so the
server's `isReq*` rules behave correctly:
`customerName`, `customerAddress`, `customerNumber`, `serviceNumber`,
`trid` (auto-generated otherwise), `tag`, `callbackUrl`, `cdata`.

After the collect succeeds the harness prints the `ptn`, `status`,
`receiptNumber`, `agentBalance`, and price fields, then sleeps briefly
and polls `/v2/verifytx` once.

> **WARNING:** This is the only path in the smoke test that moves money.
> Acceptance transactions are not reversible from the client — if you
> collect by mistake, contact your partner support representative.

Exit code: `0` on full pass, `1` if any scenario failed, `2` on a config
error before the client could start.

## Testing

```bash
npm test          # unit suite, hermetic, zero network
```

All tests use the built-in `node:test` runner. No external dependencies
are required.

## License

MIT © 2026 Maviance PLC
