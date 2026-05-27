'use strict';

/**
 * Pre-payment account checks. Backed by the partner spec
 * `Account Validation` tag.
 */

/**
 * @param {import('../http/transport').HttpTransport} transport
 */
function createAccountValidationApi(transport) {
  return {
    /**
     * `GET /v2/verify` — verify that a service number is valid for the
     * selected service. Only meaningful for services that report
     * `isVerifiable: true`.
     *
     * @param {string} merchant
     * @param {number} serviceid
     * @param {string} serviceNumber
     * @returns {Promise<boolean>} `true` if the service number is valid.
     */
    verifyServiceNumber(merchant, serviceid, serviceNumber) {
      requireString(merchant, 'merchant');
      requireNumber(serviceid, 'serviceid');
      requireString(serviceNumber, 'serviceNumber');
      return transport
        .get('/v2/verify', { merchant, serviceid, serviceNumber })
        .then((response) => response === true);
    },

    /**
     * `GET /v2/validate` — validate an account by destination (typically
     * an MSISDN or contract number) and retrieve the associated customer
     * name, when available.
     *
     * Returns a `CustomerAccount` envelope with a tri-state `status`
     * (`UNKNOWN`, `VALIDATED`, `VERIFIED`) — so callers can distinguish a
     * syntactically-correct account from one that has been cross-checked
     * against the provider.
     *
     * **Restricted endpoint.** Access is granted only to partners who
     * have cleared Maviance's internal validation and compliance review
     * (KYC / data-protection obligations apply to the returned customer
     * name). Unauthorized callers receive HTTP 401 as a
     * {@link SmobilpayApiException}. Contact your integration manager to
     * request enablement.
     *
     * @param {string} destination MSISDN or contract number to validate.
     * @param {number} serviceId   Note: camelCase per the partner spec — distinct from `serviceid` elsewhere.
     */
    validateAccount(destination, serviceId) {
      requireString(destination, 'destination');
      requireNumber(serviceId, 'serviceId');
      return transport.get('/v2/validate', { destination, serviceId });
    },
  };
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function requireNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

module.exports = {
  createAccountValidationApi,
};
