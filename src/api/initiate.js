'use strict';

/**
 * Lookups and quotes that prepare a payment collection. Backed by the
 * partner spec `Initiate` tag.
 */

/**
 * @param {import('../http/transport').HttpTransport} transport
 */
function createInitiateApi(transport) {
  return {
    /**
     * `GET /v2/bill` — search bills for a service number.
     *
     * For `SEARCHABLE_BILL` services this returns every open bill; for
     * `NON_SEARCHABLE_BILL` services it returns a single item.
     *
     * @param {string} merchant
     * @param {number} serviceid
     * @param {string} serviceNumber
     */
    bills(merchant, serviceid, serviceNumber) {
      requireString(merchant, 'merchant');
      requireNumber(serviceid, 'serviceid');
      requireString(serviceNumber, 'serviceNumber');
      return transport.get('/v2/bill', { merchant, serviceid, serviceNumber });
    },

    /**
     * `GET /v2/subscription` — search subscriptions by service number
     * and/or customer number. Exactly one of `serviceNumber` /
     * `customerNumber` must be supplied (the server rejects calls with
     * neither).
     *
     * @param {string} merchant
     * @param {number} serviceid
     * @param {string|null} serviceNumber
     * @param {string|null} customerNumber
     */
    subscriptions(merchant, serviceid, serviceNumber, customerNumber) {
      requireString(merchant, 'merchant');
      requireNumber(serviceid, 'serviceid');
      if (serviceNumber == null && customerNumber == null) {
        throw new TypeError('subscriptions: either serviceNumber or customerNumber must be provided');
      }
      return transport.get('/v2/subscription', {
        merchant,
        serviceid,
        serviceNumber,
        customerNumber,
      });
    },

    /**
     * `POST /v2/quotestd` — request a price quote for a payment
     * collection. Quotes expire after a few minutes and must be requested
     * fresh before each collection.
     *
     * @param {{ amount: number, payItemId: string }} quoteRequest
     */
    quote(quoteRequest) {
      if (quoteRequest == null || typeof quoteRequest !== 'object') {
        throw new TypeError('quote: request object is required');
      }
      const { amount, payItemId } = quoteRequest;
      if (!Number.isInteger(amount) || amount < 1) {
        throw new TypeError(`quote: amount must be a positive integer, got ${amount}`);
      }
      requireString(payItemId, 'payItemId');
      return transport.post('/v2/quotestd', { amount, payItemId });
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
  createInitiateApi,
};
