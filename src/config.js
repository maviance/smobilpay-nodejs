'use strict';

/**
 * Immutable configuration object for {@link SmobilpayClient}.
 *
 * Holds the partner base URL, OAuth 2.0 client credentials
 * (`publicKey` / `secretKey`), the `x-api-version` header value, and
 * per-request timeouts. The base URL, credentials, and callback
 * registration are issued by Maviance support during partner onboarding.
 *
 * Construct via {@link createConfig} — the function validates required
 * fields, normalises the base URL (no trailing slash), and freezes the
 * returned object so it can be shared safely across requests.
 */

/** Default `x-api-version` header value mandated by the partner spec. */
const DEFAULT_API_VERSION = '3.0.0';

/** Default per-request timeout (milliseconds). */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Refresh-ahead window (milliseconds). Tokens within this many ms of
 * expiry are treated as already-expired so the client mints a fresh one
 * before the next request would fail.
 */
const DEFAULT_TOKEN_REFRESH_SKEW_MS = 30_000;

/**
 * @typedef {Object} SmobilpayConfig
 * @property {string} baseUrl                   Partner API base URL, e.g. `https://s3p.smobilpay.acceptance.maviance.info` (no trailing slash).
 * @property {string} publicKey                 OAuth 2.0 client_id issued by Maviance.
 * @property {string} secretKey                 OAuth 2.0 client_secret issued by Maviance.
 * @property {string} apiVersion                Value sent as the `x-api-version` header. Defaults to `"3.0.0"`.
 * @property {number} requestTimeoutMs          Per-request timeout in milliseconds.
 * @property {number} tokenRefreshSkewMs        Refresh-ahead window for cached OAuth tokens, in milliseconds.
 * @property {typeof fetch} [fetch]             Override the `fetch` implementation (used by tests).
 */

/**
 * Build and validate a {@link SmobilpayConfig}. The returned object is
 * frozen and safe to share across calls and across threads.
 *
 * @param {Object} options
 * @param {string} options.baseUrl
 * @param {string} options.publicKey
 * @param {string} options.secretKey
 * @param {string} [options.apiVersion]
 * @param {number} [options.requestTimeoutMs]
 * @param {number} [options.tokenRefreshSkewMs]
 * @param {typeof fetch} [options.fetch]
 * @returns {SmobilpayConfig}
 */
function createConfig(options) {
  if (options == null || typeof options !== 'object') {
    throw new TypeError('createConfig: options object is required');
  }

  const baseUrl = requireString(options.baseUrl, 'baseUrl');
  const publicKey = requireString(options.publicKey, 'publicKey');
  const secretKey = requireString(options.secretKey, 'secretKey');

  validateUrl(baseUrl);

  const apiVersion = options.apiVersion != null
    ? requireString(options.apiVersion, 'apiVersion')
    : DEFAULT_API_VERSION;

  const requestTimeoutMs = options.requestTimeoutMs != null
    ? requirePositiveInt(options.requestTimeoutMs, 'requestTimeoutMs')
    : DEFAULT_REQUEST_TIMEOUT_MS;

  const tokenRefreshSkewMs = options.tokenRefreshSkewMs != null
    ? requireNonNegativeInt(options.tokenRefreshSkewMs, 'tokenRefreshSkewMs')
    : DEFAULT_TOKEN_REFRESH_SKEW_MS;

  return Object.freeze({
    baseUrl: stripTrailingSlash(baseUrl),
    publicKey,
    secretKey,
    apiVersion,
    requestTimeoutMs,
    tokenRefreshSkewMs,
    fetch: options.fetch,
  });
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`createConfig: '${name}' must be a non-empty string`);
  }
  return value.trim();
}

function requirePositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`createConfig: '${name}' must be a positive integer (milliseconds)`);
  }
  return value;
}

function requireNonNegativeInt(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`createConfig: '${name}' must be a non-negative integer (milliseconds)`);
  }
  return value;
}

function validateUrl(value) {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch (e) {
    throw new TypeError(`createConfig: 'baseUrl' is not a valid URL: ${value}`);
  }
}

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

module.exports = {
  createConfig,
  DEFAULT_API_VERSION,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_TOKEN_REFRESH_SKEW_MS,
};
