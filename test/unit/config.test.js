'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createConfig,
  DEFAULT_API_VERSION,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_TOKEN_REFRESH_SKEW_MS,
} = require('../../src/config');

const VALID = Object.freeze({
  baseUrl: 'https://s3p.smobilpay.acceptance.maviance.info',
  publicKey: 'pk_test',
  secretKey: 'sk_test',
});

test('createConfig populates required fields and defaults', () => {
  const cfg = createConfig(VALID);
  assert.equal(cfg.baseUrl, VALID.baseUrl);
  assert.equal(cfg.publicKey, 'pk_test');
  assert.equal(cfg.secretKey, 'sk_test');
  assert.equal(cfg.apiVersion, DEFAULT_API_VERSION);
  assert.equal(cfg.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  assert.equal(cfg.tokenRefreshSkewMs, DEFAULT_TOKEN_REFRESH_SKEW_MS);
});

test('createConfig strips trailing slash from baseUrl', () => {
  const cfg = createConfig({ ...VALID, baseUrl: 'https://api.example.invalid/' });
  assert.equal(cfg.baseUrl, 'https://api.example.invalid');
});

test('createConfig trims whitespace from strings', () => {
  const cfg = createConfig({ baseUrl: '  https://api.example.invalid ', publicKey: ' k ', secretKey: ' s ' });
  assert.equal(cfg.baseUrl, 'https://api.example.invalid');
  assert.equal(cfg.publicKey, 'k');
  assert.equal(cfg.secretKey, 's');
});

test('createConfig returns a frozen object', () => {
  const cfg = createConfig(VALID);
  assert.ok(Object.isFrozen(cfg));
  assert.throws(() => { cfg.publicKey = 'mutated'; });
});

test('createConfig accepts custom api version', () => {
  const cfg = createConfig({ ...VALID, apiVersion: '3.2.0' });
  assert.equal(cfg.apiVersion, '3.2.0');
});

test('createConfig rejects missing required fields', () => {
  assert.throws(() => createConfig({ publicKey: 'k', secretKey: 's' }), /baseUrl/);
  assert.throws(() => createConfig({ baseUrl: 'https://x', secretKey: 's' }), /publicKey/);
  assert.throws(() => createConfig({ baseUrl: 'https://x', publicKey: 'k' }), /secretKey/);
});

test('createConfig rejects non-string credentials', () => {
  assert.throws(() => createConfig({ ...VALID, publicKey: 42 }), /publicKey/);
  assert.throws(() => createConfig({ ...VALID, secretKey: '' }), /secretKey/);
});

test('createConfig rejects malformed baseUrl', () => {
  assert.throws(() => createConfig({ ...VALID, baseUrl: 'not-a-url' }), /baseUrl/);
});

test('createConfig rejects non-positive timeout', () => {
  assert.throws(() => createConfig({ ...VALID, requestTimeoutMs: 0 }), /requestTimeoutMs/);
  assert.throws(() => createConfig({ ...VALID, requestTimeoutMs: -1 }), /requestTimeoutMs/);
  assert.throws(() => createConfig({ ...VALID, requestTimeoutMs: 1.5 }), /requestTimeoutMs/);
});

test('createConfig accepts zero token refresh skew', () => {
  const cfg = createConfig({ ...VALID, tokenRefreshSkewMs: 0 });
  assert.equal(cfg.tokenRefreshSkewMs, 0);
});

test('createConfig rejects negative skew', () => {
  assert.throws(() => createConfig({ ...VALID, tokenRefreshSkewMs: -10 }), /tokenRefreshSkewMs/);
});

test('createConfig rejects null options', () => {
  assert.throws(() => createConfig(null), /options object/);
});
