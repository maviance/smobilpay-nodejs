'use strict';

/**
 * Static reference data: merchants, services, and the payment-item
 * catalogs needed to drive a payment UI. Backed by the partner spec
 * `Masterdata` tag.
 */

/**
 * @param {import('../http/transport').HttpTransport} transport
 */
function createMasterdataApi(transport) {
  return {
    /** `GET /v2/merchant` — every merchant supported by the system. */
    merchants() {
      return transport.get('/v2/merchant');
    },

    /** `GET /v2/service` — every service supported by the system. */
    services() {
      return transport.get('/v2/service');
    },

    /**
     * `GET /v2/product` — purchasable products, optionally filtered by service id.
     * @param {number} [serviceid]
     */
    products(serviceid) {
      return transport.get('/v2/product', { serviceid });
    },

    /**
     * `GET /v2/voucher` — purchasable vouchers, optionally filtered by service id.
     * The digital code is delivered on `CollectionResponse.pin` on a successful collection.
     * @param {number} [serviceid]
     */
    vouchers(serviceid) {
      return transport.get('/v2/voucher', { serviceid });
    },

    /**
     * `GET /v2/topup` — top-up packages, optionally filtered by service id.
     * @param {number} [serviceid]
     */
    topups(serviceid) {
      return transport.get('/v2/topup', { serviceid });
    },

    /**
     * `GET /v2/cashin` — cash-in (disbursement) packages, optionally filtered by service id.
     * Money flows INTO the recipient's wallet.
     * @param {number} [serviceid]
     */
    cashins(serviceid) {
      return transport.get('/v2/cashin', { serviceid });
    },

    /**
     * `GET /v2/cashout` — cash-out (collection) packages, optionally filtered by service id.
     * Money flows OUT of the customer's wallet.
     * @param {number} [serviceid]
     */
    cashouts(serviceid) {
      return transport.get('/v2/cashout', { serviceid });
    },
  };
}

module.exports = {
  createMasterdataApi,
};
