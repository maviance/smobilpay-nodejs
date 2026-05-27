'use strict';

const { SmobilpayAuthException } = require('../errors');

/**
 * Mints, caches, and refreshes OAuth 2.0 access tokens via the Smobilpay
 * `POST /oauth/token` endpoint using the `client_credentials` grant.
 *
 * Tokens are cached in memory and reused until `now + skew >= expiresAt`,
 * after which a fresh one is minted on the next request. Concurrent callers
 * coalesce onto a single in-flight mint so only one network round-trip
 * happens per refresh.
 *
 * Construct via {@link createTokenManager}. The manager exposes:
 *
 *   - `accessToken()` → `Promise<string>` — returns a valid bearer,
 *     minting if needed. Use this from request code paths.
 *   - `refresh()` → `Promise<string>` — forces a fresh mint, replacing
 *     any cached token. Useful for diagnostics.
 *   - `cachedToken()` → `OAuth2Token | null` — current cache snapshot
 *     (or `null` until first call).
 */

const TOKEN_PATH = '/oauth/token';
const GRANT_BODY = 'grant_type=client_credentials';

/**
 * @typedef {Object} OAuth2Token
 * @property {string} accessToken signed bearer token to send as `Authorization: Bearer …`
 * @property {string} tokenType   token type returned by the server (always `"Bearer"` in practice)
 * @property {Date}   expiresAt   absolute expiry instant (issuance time + `expires_in` seconds)
 */

/**
 * @param {import('../config').SmobilpayConfig} config
 * @param {Object} [options]
 * @param {() => number} [options.now] millisecond clock — injectable for tests
 */
function createTokenManager(config, options = {}) {
  const now = options.now || Date.now;
  const fetchImpl = config.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new TypeError(
      'No fetch implementation available. Use Node 18+ (which ships fetch) or pass an override via createConfig({ fetch }).',
    );
  }

  /** @type {OAuth2Token|null} */
  let current = null;
  /** @type {Promise<OAuth2Token>|null} */
  let inFlight = null;

  async function accessToken() {
    if (current && !isExpired(current, now(), config.tokenRefreshSkewMs)) {
      return current.accessToken;
    }
    const token = await mintOnce();
    return token.accessToken;
  }

  async function refresh() {
    const token = await mintForced();
    return token.accessToken;
  }

  function cachedToken() {
    return current;
  }

  function mintOnce() {
    if (inFlight) return inFlight;
    inFlight = mint()
      .then((token) => {
        current = token;
        return token;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  function mintForced() {
    if (inFlight) return inFlight;
    inFlight = mint()
      .then((token) => {
        current = token;
        return token;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function mint() {
    const issuedAt = now();
    const url = `${config.baseUrl}${TOKEN_PATH}`;
    const authHeader = `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`, 'utf8').toString('base64')}`;

    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: GRANT_BODY,
      }, config.requestTimeoutMs);
    } catch (e) {
      throw new SmobilpayAuthException(0, null, `Failed to call ${TOKEN_PATH}: ${e.message}`, e);
    }

    const body = await safeReadBody(response);
    if (!response.ok) {
      const oauthError = tryReadOAuthErrorCode(body);
      const suffix = oauthError ? `, error=${oauthError}` : '';
      const bodySuffix = body ? `: ${body}` : '';
      throw new SmobilpayAuthException(
        response.status,
        oauthError,
        `OAuth token mint failed (HTTP ${response.status}${suffix})${bodySuffix}`,
      );
    }

    return parseTokenResponse(body, issuedAt);
  }

  return {
    accessToken,
    refresh,
    cachedToken,
  };
}

function isExpired(token, nowMs, skewMs) {
  return nowMs + skewMs >= token.expiresAt.getTime();
}

function parseTokenResponse(body, issuedAtMs) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new SmobilpayAuthException(200, null, `OAuth token response was not valid JSON: ${e.message}`, e);
  }
  const accessToken = parsed.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new SmobilpayAuthException(200, null, "OAuth token response missing required field 'access_token'");
  }
  const expiresIn = parsed.expires_in;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
    throw new SmobilpayAuthException(200, null, "OAuth token response missing required field 'expires_in'");
  }
  const tokenType = typeof parsed.token_type === 'string' && parsed.token_type.length > 0
    ? parsed.token_type
    : 'Bearer';
  return {
    accessToken,
    tokenType,
    expiresAt: new Date(issuedAtMs + expiresIn * 1000),
  };
}

function tryReadOAuthErrorCode(body) {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* body wasn't JSON */
  }
  return null;
}

async function safeReadBody(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  createTokenManager,
};
