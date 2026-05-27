'use strict';

/**
 * Error hierarchy for the Smobilpay client. Every failure surfaces as an
 * instance of {@link SmobilpayError}; callers can narrow with `instanceof`
 * on the two specialised subtypes:
 *
 *   - {@link SmobilpayAuthException} — OAuth 2.0 token issuance failed
 *     (`POST /oauth/token` returned a non-2xx response or the body was
 *     unreadable). Carries `httpStatus` and the OAuth `error` identifier
 *     (e.g. `"invalid_client"`).
 *
 *   - {@link SmobilpayApiException} — a `/v2/*` endpoint returned a non-2xx
 *     response. Carries the HTTP status, the parsed `ApiError` envelope
 *     (when the server provided one), and the raw response body for
 *     diagnostics.
 *
 * For programmatic error handling match on `apiError.respCode` — the
 * canonical machine identifier per the partner spec.
 */

class SmobilpayError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SmobilpayError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

class SmobilpayAuthException extends SmobilpayError {
  /**
   * @param {number} httpStatus HTTP status code (0 if the request never reached the server)
   * @param {string|null} oauthError standard OAuth 2.0 error identifier (e.g. `"invalid_client"`)
   * @param {string} message human-readable message
   * @param {Error} [cause]
   */
  constructor(httpStatus, oauthError, message, cause) {
    super(message, cause);
    this.name = 'SmobilpayAuthException';
    this.httpStatus = httpStatus;
    this.oauthError = oauthError;
  }
}

class SmobilpayApiException extends SmobilpayError {
  /**
   * @param {number} httpStatus HTTP status code returned by the API
   * @param {object|null} apiError parsed `ApiError` envelope, or `null` if the body was not JSON
   * @param {string} rawBody raw response body for diagnostics
   */
  constructor(httpStatus, apiError, rawBody) {
    super(buildApiMessage(httpStatus, apiError, rawBody));
    this.name = 'SmobilpayApiException';
    this.httpStatus = httpStatus;
    this.apiError = apiError;
    this.rawBody = rawBody;
  }

  /** Short-hand accessor matching the Java client. */
  get respCode() {
    return this.apiError ? this.apiError.respCode : null;
  }
}

function buildApiMessage(httpStatus, apiError, rawBody) {
  if (apiError && apiError.respCode != null) {
    return `Smobilpay API error (HTTP ${httpStatus}, respCode=${apiError.respCode}): ${apiError.devMsg}`;
  }
  const body = rawBody && rawBody.length > 0 ? rawBody : '<empty body>';
  return `Smobilpay API error (HTTP ${httpStatus}): ${body}`;
}

module.exports = {
  SmobilpayError,
  SmobilpayAuthException,
  SmobilpayApiException,
};
