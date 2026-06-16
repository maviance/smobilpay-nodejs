// Type definitions for @maviance/smobilpay-s3p-client (v3.x)
// Project: https://github.com/maviance/smobilpay-s3p-client-nodejs
//
// Hand-authored declarations for a CommonJS, zero-dependency package.
//
// Design note: request inputs are typed precisely (mirroring the runtime
// validation in `src/`). Response bodies are returned **unparsed** by the
// client, so they are typed as `unknown` — narrow them at the call site
// rather than trusting the wire shape. The few endpoints with a guaranteed
// shape (e.g. `verifyServiceNumber` → `boolean`) are typed exactly.

/** A `Date`, an ISO-8601 string, or a bare `"YYYY-MM-DD"` (start of that UTC day). */
export type DateInput = Date | string;

/**
 * A `fetch`-compatible function. Resolves to the global `fetch` type when it
 * is available (Node 18+ / `@types/node` / DOM lib), and degrades gracefully
 * otherwise so these declarations never hard-error on the `fetch` override.
 */
export type FetchLike = typeof globalThis extends { fetch: infer F }
  ? F
  : (input: string, init?: unknown) => Promise<unknown>;

/** Options accepted by {@link createClient} and {@link createConfig}. */
export interface SmobilpayClientOptions {
  /** Partner API base URL, e.g. `https://api.acceptance.example.invalid`. A trailing slash is stripped. */
  baseUrl: string;
  /** OAuth 2.0 `client_id` issued at partner onboarding. */
  publicKey: string;
  /** OAuth 2.0 `client_secret` issued at partner onboarding. */
  secretKey: string;
  /** Value sent as the `x-api-version` header. Defaults to {@link DEFAULT_API_VERSION} (`"3.0.0"`). */
  apiVersion?: string;
  /** Per-request timeout in milliseconds. Must be a positive integer. Defaults to {@link DEFAULT_REQUEST_TIMEOUT_MS}. */
  requestTimeoutMs?: number;
  /** Refresh-ahead window for cached OAuth tokens, in milliseconds. Defaults to {@link DEFAULT_TOKEN_REFRESH_SKEW_MS}. */
  tokenRefreshSkewMs?: number;
  /** Override the `fetch` implementation (used by tests). */
  fetch?: FetchLike;
}

/** Frozen, validated configuration produced by {@link createConfig}. */
export interface SmobilpayConfig {
  readonly baseUrl: string;
  readonly publicKey: string;
  readonly secretKey: string;
  readonly apiVersion: string;
  readonly requestTimeoutMs: number;
  readonly tokenRefreshSkewMs: number;
  readonly fetch?: FetchLike;
}

/** Parsed `ApiError` envelope carried by {@link SmobilpayApiException}. */
export interface ApiError {
  /** Canonical machine identifier per the partner spec. Match on this for programmatic handling. */
  respCode: number;
  /** Developer-facing message. */
  devMsg?: string;
  /** End-user-facing message. */
  usrMsg?: string;
  /** Link to further documentation for this error. */
  link?: string;
}

/** In-memory snapshot of a minted OAuth 2.0 bearer token. */
export interface OAuth2Token {
  /** Signed bearer token sent as `Authorization: Bearer …`. */
  accessToken: string;
  /** Token type returned by the server (always `"Bearer"` in practice). */
  tokenType: string;
  /** Absolute expiry instant (issuance time + `expires_in` seconds). */
  expiresAt: Date;
}

/** OAuth 2.0 token cache exposed as `client.tokens`. */
export interface TokenManager {
  /** Returns a valid bearer, minting a fresh one if the cache is empty or expired. */
  accessToken(): Promise<string>;
  /** Forces a fresh mint, replacing any cached token. Returns the new bearer. */
  refresh(): Promise<string>;
  /** Current cache snapshot, or `null` until the first mint. */
  cachedToken(): OAuth2Token | null;
}

/** `client.verify` — status and account verification (`Verify` tag). */
export interface VerifyApi {
  /** `GET /v2/ping` — authenticated round-trip probe. */
  ping(): Promise<unknown>;
  /** `GET /v2/account` — the authenticated agent's account profile. */
  account(): Promise<unknown>;
  /**
   * `GET /v2/verifytx` — current status of a collection by `ptn` and/or `trid`.
   * At least one argument must be non-null.
   */
  verifyTransaction(ptn: string | null, trid: string | null): Promise<unknown>;
  /** `GET /v2/historystd` — search history by exact payment transaction number. */
  historyByPtn(ptn: string): Promise<unknown>;
  /** `GET /v2/historystd` — search history by caller's transaction reference. */
  historyByTrid(trid: string): Promise<unknown>;
  /** `GET /v2/historystd` — search history by an inclusive UTC date range. */
  historyByDateRange(from: DateInput, to: DateInput): Promise<unknown>;
}

/** `client.masterdata` — static reference data (`Masterdata` tag). */
export interface MasterdataApi {
  /** `GET /v2/merchant` — every merchant supported by the system. */
  merchants(): Promise<unknown>;
  /** `GET /v2/service` — every service supported by the system. */
  services(): Promise<unknown>;
  /** `GET /v2/product` — purchasable products, optionally filtered by service id. */
  products(serviceid?: number): Promise<unknown>;
  /** `GET /v2/voucher` — purchasable vouchers, optionally filtered by service id. */
  vouchers(serviceid?: number): Promise<unknown>;
  /** `GET /v2/topup` — top-up packages, optionally filtered by service id. */
  topups(serviceid?: number): Promise<unknown>;
  /** `GET /v2/cashin` — cash-in (disbursement) packages, optionally filtered by service id. */
  cashins(serviceid?: number): Promise<unknown>;
  /** `GET /v2/cashout` — cash-out (collection) packages, optionally filtered by service id. */
  cashouts(serviceid?: number): Promise<unknown>;
}

/** Price-quote request accepted by {@link InitiateApi.quote}. */
export interface QuoteRequest {
  /** Amount to collect. Must be a positive integer. */
  amount: number;
  /** Identifier of the payment item being purchased. */
  payItemId: string;
}

/** `client.initiate` — lookups and quotes (`Initiate` tag). */
export interface InitiateApi {
  /** `GET /v2/bill` — search bills for a service number. */
  bills(merchant: string, serviceid: number, serviceNumber: string): Promise<unknown>;
  /**
   * `GET /v2/subscription` — search subscriptions. Exactly one of
   * `serviceNumber` / `customerNumber` must be supplied.
   */
  subscriptions(
    merchant: string,
    serviceid: number,
    serviceNumber: string | null,
    customerNumber: string | null,
  ): Promise<unknown>;
  /** `POST /v2/quotestd` — request a price quote for a collection. */
  quote(quoteRequest: QuoteRequest): Promise<unknown>;
}

/** Collection request accepted by {@link ConfirmApi.collect}. */
export interface CollectionRequest {
  /** UUID of the quote returned by `POST /v2/quotestd`. */
  quoteId: string;
  /** Phone number that initiates the payment. */
  customerPhonenumber: string;
  /** Email address that receives the receipt. */
  customerEmailaddress: string;
  /** Required only if the service's `isReqCustomerName` flag is set. */
  customerName?: string;
  /** Required only if the service's `isReqCustomerAddress` flag is set. */
  customerAddress?: string;
  /** Required only if the service's `isReqCustomerNumber` flag is set. */
  customerNumber?: string;
  /** Required only if the service's `isReqServiceNumber` flag is set. */
  serviceNumber?: string;
  /** Caller's transaction reference. Returned on responses and webhooks. */
  trid?: string;
  /** Free-form tag attached to the payment (max 50 chars). */
  tag?: string;
  /** Webhook URL invoked when the payment clears (max 255 chars). */
  callbackUrl?: string;
  /** Custom data string echoed back on the response. */
  cdata?: string;
}

/** `client.confirm` — execute collections (`Confirm` tag). */
export interface ConfirmApi {
  /**
   * `POST /v2/collectstd` — execute a collection against an unexpired quote.
   * Under `x-api-version: 3.0.0` the server rewrites `SUCCESS` to `PENDING`;
   * poll `/v2/verifytx` or await the `callbackUrl` webhook for the final status.
   */
  collect(request: CollectionRequest): Promise<unknown>;
}

/** `client.accountValidation` — pre-payment account checks (`Account Validation` tag). */
export interface AccountValidationApi {
  /**
   * `GET /v2/verify` — verify a service number for the selected service.
   * @returns `true` if the service number is valid.
   */
  verifyServiceNumber(merchant: string, serviceid: number, serviceNumber: string): Promise<boolean>;
  /**
   * `GET /v2/validate` — validate an account by destination and retrieve the
   * associated customer name. **Restricted endpoint** (HTTP 401 for
   * unauthorized callers, surfaced as {@link SmobilpayApiException}).
   *
   * Note: `serviceId` is camelCase per the partner spec — distinct from the
   * `serviceid` used elsewhere.
   */
  validateAccount(destination: string, serviceId: number): Promise<unknown>;
}

/** Top-level client returned by {@link createClient}. Frozen; reuse for the app lifetime. */
export interface SmobilpayClient {
  readonly config: SmobilpayConfig;
  readonly tokens: TokenManager;
  readonly verify: VerifyApi;
  readonly masterdata: MasterdataApi;
  readonly initiate: InitiateApi;
  readonly confirm: ConfirmApi;
  readonly accountValidation: AccountValidationApi;
}

/** Build a Smobilpay API client. Lazily mints an OAuth 2.0 token on first use. */
export function createClient(options: SmobilpayClientOptions): SmobilpayClient;

/** Build and validate a {@link SmobilpayConfig} without constructing a client. */
export function createConfig(options: SmobilpayClientOptions): SmobilpayConfig;

/** Base class for every error thrown by the client. Narrow with `instanceof`. */
export class SmobilpayError extends Error {
  constructor(message: string, cause?: unknown);
  readonly name: string;
  readonly cause?: unknown;
}

/** OAuth 2.0 token issuance failed (`POST /oauth/token` non-2xx or unreadable body). */
export class SmobilpayAuthException extends SmobilpayError {
  constructor(httpStatus: number, oauthError: string | null, message: string, cause?: unknown);
  /** HTTP status code (`0` if the request never reached the server). */
  readonly httpStatus: number;
  /** Standard OAuth 2.0 error identifier (e.g. `"invalid_client"`), or `null`. */
  readonly oauthError: string | null;
}

/** A `/v2/*` endpoint returned a non-2xx response. */
export class SmobilpayApiException extends SmobilpayError {
  constructor(httpStatus: number, apiError: ApiError | null, rawBody: string);
  /** HTTP status code returned by the API. */
  readonly httpStatus: number;
  /** Parsed `ApiError` envelope, or `null` when the body was missing / not JSON. */
  readonly apiError: ApiError | null;
  /** Raw response body, for diagnostics. */
  readonly rawBody: string;
  /** Short-hand for `apiError?.respCode`. */
  readonly respCode: number | null;
}

/** Default `x-api-version` header value (`"3.0.0"`). */
export const DEFAULT_API_VERSION: string;
/** Default per-request timeout in milliseconds (`30000`). */
export const DEFAULT_REQUEST_TIMEOUT_MS: number;
/** Default refresh-ahead window for cached OAuth tokens, in milliseconds (`30000`). */
export const DEFAULT_TOKEN_REFRESH_SKEW_MS: number;
