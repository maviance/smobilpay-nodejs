'use strict';

const { createConfig } = require('./config');
const { createTokenManager } = require('./auth/token-manager');
const { createTransport } = require('./http/transport');
const { createMasterdataApi } = require('./api/masterdata');
const { createInitiateApi } = require('./api/initiate');
const { createConfirmApi } = require('./api/confirm');
const { createVerifyApi } = require('./api/verify');
const { createAccountValidationApi } = require('./api/account-validation');

/**
 * Top-level entry point for the Smobilpay partner API.
 *
 * Construct a client with {@link createClient}; the client lazily mints
 * an OAuth 2.0 bearer token on the first authenticated request and
 * caches it until expiry. Pick an API group via the accessor properties:
 *
 *     const client = createClient({
 *       baseUrl: 'https://s3p.smobilpay.acceptance.maviance.info',
 *       publicKey: process.env.SMOBILPAY_PUBLIC_KEY,
 *       secretKey: process.env.SMOBILPAY_SECRET_KEY,
 *     });
 *
 *     const pong = await client.verify.ping();
 *     const merchants = await client.masterdata.merchants();
 *
 * The returned client is stateless apart from the cached OAuth token and
 * is intended to be reused for the lifetime of the application.
 *
 * @typedef {Object} SmobilpayClient
 * @property {import('./config').SmobilpayConfig} config
 * @property {ReturnType<import('./auth/token-manager').createTokenManager>} tokens
 * @property {ReturnType<import('./api/masterdata').createMasterdataApi>} masterdata
 * @property {ReturnType<import('./api/initiate').createInitiateApi>} initiate
 * @property {ReturnType<import('./api/confirm').createConfirmApi>} confirm
 * @property {ReturnType<import('./api/verify').createVerifyApi>} verify
 * @property {ReturnType<import('./api/account-validation').createAccountValidationApi>} accountValidation
 */

/**
 * Build a Smobilpay API client.
 *
 * @param {Parameters<typeof createConfig>[0]} options
 * @returns {SmobilpayClient}
 */
function createClient(options) {
  const config = createConfig(options);
  const tokens = createTokenManager(config);
  const transport = createTransport(config, tokens);
  return Object.freeze({
    config,
    tokens,
    masterdata: createMasterdataApi(transport),
    initiate: createInitiateApi(transport),
    confirm: createConfirmApi(transport),
    verify: createVerifyApi(transport),
    accountValidation: createAccountValidationApi(transport),
  });
}

module.exports = {
  createClient,
};
