'use strict';

/**
 * Public surface of `@maviance/smobilpay-s3p-client`.
 *
 *     const { createClient, SmobilpayApiException } = require('@maviance/smobilpay-s3p-client');
 *
 *     const client = createClient({
 *       baseUrl: process.env.SMOBILPAY_BASE_URL,
 *       publicKey: process.env.SMOBILPAY_PUBLIC_KEY,
 *       secretKey: process.env.SMOBILPAY_SECRET_KEY,
 *     });
 *
 *     try {
 *       const pong = await client.verify.ping();
 *       console.log(pong);
 *     } catch (e) {
 *       if (e instanceof SmobilpayApiException) {
 *         console.error('respCode', e.respCode, 'devMsg', e.apiError?.devMsg);
 *       } else {
 *         throw e;
 *       }
 *     }
 */

const { createClient } = require('./client');
const {
  createConfig,
  DEFAULT_API_VERSION,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_TOKEN_REFRESH_SKEW_MS,
} = require('./config');
const {
  SmobilpayError,
  SmobilpayAuthException,
  SmobilpayApiException,
} = require('./errors');

module.exports = {
  // Factory
  createClient,
  createConfig,

  // Errors
  SmobilpayError,
  SmobilpayAuthException,
  SmobilpayApiException,

  // Constants
  DEFAULT_API_VERSION,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_TOKEN_REFRESH_SKEW_MS,
};
