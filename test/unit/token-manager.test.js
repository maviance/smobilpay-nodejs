'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTokenManager } = require('../../src/auth/token-manager');
const { createConfig } = require('../../src/config');
const { SmobilpayAuthException } = require('../../src/errors');
const { createMockFetch } = require('./_helpers/mock-fetch');

function makeConfig(overrides = {}) {
  const fetchImpl = overrides.fetch || createMockFetch();
  const cfg = createConfig({
    baseUrl: 'https://api.example.invalid',
    publicKey: 'pk',
    secretKey: 'sk',
    tokenRefreshSkewMs: 0,
    ...overrides,
    fetch: fetchImpl,
  });
  return { cfg, fetchImpl };
}

test('accessToken mints and caches a token', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(200, { access_token: 't1', expires_in: 3600, token_type: 'Bearer' });
  let nowMs = 1_000_000;
  const mgr = createTokenManager(cfg, { now: () => nowMs });

  assert.equal(await mgr.accessToken(), 't1');
  assert.equal(await mgr.accessToken(), 't1');
  assert.equal(fetchImpl.calls.length, 1, 'second call should reuse cached token');
});

test('mint posts Basic auth + client_credentials body to /oauth/token', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(200, { access_token: 't', expires_in: 3600 });
  const mgr = createTokenManager(cfg, { now: () => 0 });
  await mgr.accessToken();
  const call = fetchImpl.lastCall();
  assert.equal(call.url, 'https://api.example.invalid/oauth/token');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.body, 'grant_type=client_credentials');
  assert.equal(call.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  // Basic base64("pk:sk") = "cGs6c2s="
  assert.equal(call.init.headers.Authorization, 'Basic cGs6c2s=');
});

test('accessToken refreshes when within the skew window', async () => {
  const { cfg, fetchImpl } = makeConfig({ tokenRefreshSkewMs: 60_000 });
  fetchImpl.queueJson(200, { access_token: 't1', expires_in: 100 });
  fetchImpl.queueJson(200, { access_token: 't2', expires_in: 3600 });

  let nowMs = 1_000_000;
  const mgr = createTokenManager(cfg, { now: () => nowMs });

  assert.equal(await mgr.accessToken(), 't1');
  // Move clock to within skew of expiry (token expires at +100s, skew 60s).
  nowMs += 45_000;
  assert.equal(await mgr.accessToken(), 't2');
  assert.equal(fetchImpl.calls.length, 2);
});

test('refresh() forces a fresh mint even when cache is valid', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(200, { access_token: 't1', expires_in: 3600 });
  fetchImpl.queueJson(200, { access_token: 't2', expires_in: 3600 });
  const mgr = createTokenManager(cfg, { now: () => 0 });
  assert.equal(await mgr.accessToken(), 't1');
  assert.equal(await mgr.refresh(), 't2');
  assert.equal(fetchImpl.calls.length, 2);
});

test('concurrent accessToken calls coalesce onto a single mint', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(200, { access_token: 't1', expires_in: 3600 });
  const mgr = createTokenManager(cfg, { now: () => 0 });
  const results = await Promise.all([mgr.accessToken(), mgr.accessToken(), mgr.accessToken()]);
  assert.deepEqual(results, ['t1', 't1', 't1']);
  assert.equal(fetchImpl.calls.length, 1);
});

test('non-2xx response throws SmobilpayAuthException with oauth error', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(401, { error: 'invalid_client', error_description: 'bad creds' });
  const mgr = createTokenManager(cfg, { now: () => 0 });
  await assert.rejects(() => mgr.accessToken(), (err) => {
    assert.ok(err instanceof SmobilpayAuthException);
    assert.equal(err.httpStatus, 401);
    assert.equal(err.oauthError, 'invalid_client');
    return true;
  });
});

test('non-JSON success body throws SmobilpayAuthException', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueText(200, 'not json');
  const mgr = createTokenManager(cfg, { now: () => 0 });
  await assert.rejects(() => mgr.accessToken(), /not valid JSON/);
});

test('missing access_token field throws SmobilpayAuthException', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(200, { expires_in: 3600 });
  const mgr = createTokenManager(cfg, { now: () => 0 });
  await assert.rejects(() => mgr.accessToken(), /access_token/);
});

test('missing expires_in field throws SmobilpayAuthException', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(200, { access_token: 'x' });
  const mgr = createTokenManager(cfg, { now: () => 0 });
  await assert.rejects(() => mgr.accessToken(), /expires_in/);
});

test('network error wraps as SmobilpayAuthException with httpStatus=0', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueError(new Error('ECONNREFUSED'));
  const mgr = createTokenManager(cfg, { now: () => 0 });
  await assert.rejects(() => mgr.accessToken(), (err) => {
    assert.ok(err instanceof SmobilpayAuthException);
    assert.equal(err.httpStatus, 0);
    assert.match(err.message, /Failed to call/);
    return true;
  });
});

test('cachedToken returns null before first call, snapshot after', async () => {
  const { cfg, fetchImpl } = makeConfig();
  fetchImpl.queueJson(200, { access_token: 't', expires_in: 3600 });
  const mgr = createTokenManager(cfg, { now: () => 1000 });
  assert.equal(mgr.cachedToken(), null);
  await mgr.accessToken();
  const snap = mgr.cachedToken();
  assert.equal(snap.accessToken, 't');
  assert.equal(snap.expiresAt.getTime(), 1000 + 3600 * 1000);
});
