'use strict';

/**
 * Execute payment collections against a previously-issued quote. Backed
 * by the partner spec `Confirm` tag.
 */

const MAX_TAG_LEN = 50;
const MAX_CALLBACK_URL_LEN = 255;

/**
 * @typedef {Object} CollectionRequest
 * @property {string} quoteId               UUID of the quote returned by `POST /v2/quotestd`.
 * @property {string} customerPhonenumber   Phone number that initiates the payment.
 * @property {string} customerEmailaddress  Email address that receives the receipt.
 * @property {string} [customerName]        Required only if the {@link Service}'s `isReqCustomerName` flag is set.
 * @property {string} [customerAddress]     Required only if the service's `isReqCustomerAddress` flag is set.
 * @property {string} [customerNumber]      Required only if the service's `isReqCustomerNumber` flag is set.
 * @property {string} [serviceNumber]       Required only if the service's `isReqServiceNumber` flag is set.
 * @property {string} [trid]                Caller's transaction reference. Returned on responses and webhooks.
 * @property {string} [tag]                 Free-form tag attached to the payment (max 50 chars).
 * @property {string} [callbackUrl]         Webhook URL invoked when the payment clears (max 255 chars).
 * @property {string} [cdata]               Custom data string echoed back on the response.
 */

/**
 * @param {import('../http/transport').HttpTransport} transport
 */
function createConfirmApi(transport) {
  return {
    /**
     * `POST /v2/collectstd` — execute a payment collection against a
     * valid (unexpired) quote.
     *
     * A `498` response indicates the quote has expired; re-quote before
     * retrying.
     *
     * Note: when the request header `x-api-version: 3.0.0` is set, the
     * server rewrites `SUCCESS` to `PENDING` on the response. Poll
     * `/v2/verifytx` or wait for the `callbackUrl` webhook to learn the
     * final status.
     *
     * @param {CollectionRequest} request
     */
    collect(request) {
      const body = validateCollectionRequest(request);
      return transport.post('/v2/collectstd', body);
    },
  };
}

function validateCollectionRequest(request) {
  if (request == null || typeof request !== 'object') {
    throw new TypeError('collect: request object is required');
  }
  const required = ['quoteId', 'customerPhonenumber', 'customerEmailaddress'];
  for (const field of required) {
    if (typeof request[field] !== 'string' || request[field].length === 0) {
      throw new TypeError(`collect: '${field}' is required`);
    }
  }
  if (request.tag != null && request.tag.length > MAX_TAG_LEN) {
    throw new RangeError(`collect: 'tag' exceeds ${MAX_TAG_LEN}-character limit (length=${request.tag.length})`);
  }
  if (request.callbackUrl != null && request.callbackUrl.length > MAX_CALLBACK_URL_LEN) {
    throw new RangeError(
      `collect: 'callbackUrl' exceeds ${MAX_CALLBACK_URL_LEN}-character limit (length=${request.callbackUrl.length})`,
    );
  }
  const body = {};
  for (const [k, v] of Object.entries(request)) {
    if (v !== undefined && v !== null) body[k] = v;
  }
  return body;
}

module.exports = {
  createConfirmApi,
};
