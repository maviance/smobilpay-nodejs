'use strict';

const { startOfUtcDay, endOfUtcDay, toIsoOffsetDateTime } = require('../http/dates');

/**
 * Status and account verification endpoints. Backed by the partner spec
 * `Verify` tag.
 */

/**
 * @param {import('../http/transport').HttpTransport} transport
 */
function createVerifyApi(transport) {
  return {
    /**
     * `GET /v2/ping` — authenticated round-trip probe. Returns the server
     * time, the protocol version, the request nonce, and the public token
     * used to authenticate the request.
     */
    ping() {
      return transport.get('/v2/ping');
    },

    /**
     * `GET /v2/account` — the authenticated agent's account profile.
     */
    account() {
      return transport.get('/v2/account');
    },

    /**
     * `GET /v2/verifytx` — current status of a payment collection by
     * `ptn` and/or `trid`. At least one parameter must be provided.
     *
     * @param {string|null} ptn
     * @param {string|null} trid
     */
    verifyTransaction(ptn, trid) {
      if (ptn == null && trid == null) {
        throw new TypeError('verifyTransaction: at least one of ptn or trid must be provided');
      }
      return transport.get('/v2/verifytx', { ptn, trid });
    },

    /**
     * `GET /v2/historystd` by PTN — search history by exact payment
     * transaction number.
     *
     * @param {string} ptn
     */
    historyByPtn(ptn) {
      if (typeof ptn !== 'string' || ptn.length === 0) {
        throw new TypeError('historyByPtn: ptn is required');
      }
      return transport.get('/v2/historystd', { ptn });
    },

    /**
     * `GET /v2/historystd` by TRID — search history by caller's
     * transaction reference.
     *
     * @param {string} trid
     */
    historyByTrid(trid) {
      if (typeof trid !== 'string' || trid.length === 0) {
        throw new TypeError('historyByTrid: trid is required');
      }
      return transport.get('/v2/historystd', { trid });
    },

    /**
     * `GET /v2/historystd` by date range — search history by an inclusive
     * UTC date range. Accepts `Date` instances or ISO-8601 strings
     * (`"YYYY-MM-DD"` is accepted and treated as the start of that UTC day).
     *
     * @param {Date|string} from
     * @param {Date|string} to
     */
    historyByDateRange(from, to) {
      if (from == null || to == null) {
        throw new TypeError('historyByDateRange: both from and to dates are required');
      }
      const start = startOfUtcDay(from);
      const end = endOfUtcDay(to);
      if (end.getTime() < start.getTime()) {
        throw new RangeError('historyByDateRange: to date is before from date');
      }
      return transport.get('/v2/historystd', {
        timestamp_from: toIsoOffsetDateTime(start),
        timestamp_to: toIsoOffsetDateTime(end),
      });
    },
  };
}

module.exports = {
  createVerifyApi,
};
