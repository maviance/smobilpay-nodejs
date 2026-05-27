'use strict';

const { SmobilpayApiException, SmobilpayError } = require('../errors');
const { buildQueryString } = require('./query');

/**
 * Request/response engine for the Smobilpay client. Wraps `fetch`:
 *
 *   1. Resolves the request URL from `baseUrl + path + ?query`.
 *   2. Asks the token manager for a fresh bearer (the manager caches it).
 *   3. Attaches `Authorization: Bearer`, `x-api-version`, and
 *      `Accept: application/json` headers.
 *   4. Dispatches the request under a per-request timeout, parses the
 *      response body as JSON, or throws {@link SmobilpayApiException} on
 *      non-2xx.
 *
 * The transport itself is stateless once constructed — the same instance
 * is reused by every API group and across concurrent calls.
 */

/**
 * @typedef {Object} HttpTransport
 * @property {(path: string, query?: Record<string, unknown>) => Promise<any>} get
 * @property {(path: string, body?: any) => Promise<any>} post
 */

/**
 * @param {import('../config').SmobilpayConfig} config
 * @param {{ accessToken: () => Promise<string> }} tokenManager
 * @returns {HttpTransport}
 */
function createTransport(config, tokenManager) {
  const fetchImpl = config.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new TypeError(
      'No fetch implementation available. Use Node 18+ (which ships fetch) or pass an override via createConfig({ fetch }).',
    );
  }

  async function get(path, query) {
    const url = resolveUrl(config.baseUrl, path, query);
    const headers = await authHeaders(tokenManager, config.apiVersion);
    const response = await dispatch(fetchImpl, url, {
      method: 'GET',
      headers,
    }, config.requestTimeoutMs);
    return parseResponse(response);
  }

  async function post(path, body) {
    const url = resolveUrl(config.baseUrl, path, null);
    const headers = await authHeaders(tokenManager, config.apiVersion);
    headers['Content-Type'] = 'application/json';
    const response = await dispatch(fetchImpl, url, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }, config.requestTimeoutMs);
    return parseResponse(response);
  }

  return { get, post };
}

function resolveUrl(baseUrl, path, query) {
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  const queryString = query ? buildQueryString(query) : '';
  return queryString.length > 0
    ? `${baseUrl}${normalisedPath}?${queryString}`
    : `${baseUrl}${normalisedPath}`;
}

async function authHeaders(tokenManager, apiVersion) {
  const bearer = await tokenManager.accessToken();
  return {
    Authorization: `Bearer ${bearer}`,
    'x-api-version': apiVersion,
    Accept: 'application/json',
  };
}

async function dispatch(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new SmobilpayError(`HTTP transport error: ${e.message}`, e);
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponse(response) {
  const body = await safeReadBody(response);
  if (response.status >= 200 && response.status < 300) {
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch (e) {
      throw new SmobilpayError(`Failed to parse response body: ${e.message}`, e);
    }
  }
  throw new SmobilpayApiException(response.status, parseApiError(body), body);
}

/**
 * Recognise a Smobilpay `ApiError` envelope and coerce `respCode` to a
 * number. The server is documented to return an integer respCode but its
 * acceptance environment occasionally emits it as a quoted string
 * (e.g. `"40302"`); we tolerate either form so callers can match on
 * `e.respCode === 40302` regardless of which shape the server sends.
 *
 * Returns `null` when the body is empty, not JSON, or does not look
 * like an envelope.
 */
function parseApiError(body) {
  if (!body) return null;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const rc = parsed.respCode;
  let respCode;
  if (typeof rc === 'number' && Number.isFinite(rc)) {
    respCode = rc;
  } else if (typeof rc === 'string' && rc.trim() !== '' && Number.isFinite(Number(rc))) {
    respCode = Number(rc);
  } else {
    return null;
  }
  return { ...parsed, respCode };
}

async function safeReadBody(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

module.exports = {
  createTransport,
};
