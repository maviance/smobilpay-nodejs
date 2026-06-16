'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTransport } = require('../../src/http/transport');
const { createConfig } = require('../../src/config');
const { SmobilpayApiException, SmobilpayError } = require('../../src/errors');
const { createMockFetch } = require('./_helpers/mock-fetch');

function makeSetup(overrides = {}) {
  const fetchImpl = overrides.fetch || createMockFetch();
  const cfg = createConfig({
    baseUrl: 'https://api.example.invalid',
    publicKey: 'pk',
    secretKey: 'sk',
    apiVersion: '3.2.0',
    ...overrides,
    fetch: fetchImpl,
  });
  const tokenManager = {
    accessToken: async () => 'bearer-test',
  };
  return { cfg, fetchImpl, transport: createTransport(cfg, tokenManager) };
}

test('get attaches bearer + x-api-version + Accept headers', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueJson(200, { ok: true });
  await transport.get('/v2/ping');
  const call = fetchImpl.lastCall();
  assert.equal(call.url, 'https://api.example.invalid/v2/ping');
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers.Authorization, 'Bearer bearer-test');
  assert.equal(call.init.headers['x-api-version'], '3.2.0');
  assert.equal(call.init.headers.Accept, 'application/json');
});

test('get serialises query parameters', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueJson(200, []);
  await transport.get('/v2/bill', { merchant: 'ENEO', serviceid: 10039, serviceNumber: '203157530' });
  assert.equal(
    fetchImpl.lastCall().url,
    'https://api.example.invalid/v2/bill?merchant=ENEO&serviceid=10039&serviceNumber=203157530',
  );
});

test('post sends JSON body with content-type', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueJson(200, { quoteId: 'abc' });
  const body = { amount: 500, payItemId: 'PI' };
  const result = await transport.post('/v2/quotestd', body);
  const call = fetchImpl.lastCall();
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.equal(call.init.body, JSON.stringify(body));
  assert.deepEqual(result, { quoteId: 'abc' });
});

test('get parses JSON response on 2xx', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueJson(200, [{ merchant: 'ENEO' }]);
  const result = await transport.get('/v2/merchant');
  assert.deepEqual(result, [{ merchant: 'ENEO' }]);
});

test('get returns null on 204 / empty body', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueText(204, '');
  const result = await transport.get('/v2/something');
  assert.equal(result, null);
});

test('non-2xx with ApiError envelope throws SmobilpayApiException', async () => {
  const { fetchImpl, transport } = makeSetup();
  const apiError = { respCode: 41004, devMsg: 'service does not exist', usrMsg: null, link: null };
  fetchImpl.queueJson(400, apiError);
  await assert.rejects(() => transport.get('/v2/voucher', { serviceid: 999 }), (err) => {
    assert.ok(err instanceof SmobilpayApiException);
    assert.equal(err.httpStatus, 400);
    assert.equal(err.respCode, 41004);
    return true;
  });
});

test('non-2xx with string respCode is coerced to number (acceptance quirk)', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueJson(400, { respCode: '40302', devMsg: 'service rules', usrMsg: null, link: null });
  await assert.rejects(() => transport.post('/v2/collectstd', {}), (err) => {
    assert.ok(err instanceof SmobilpayApiException);
    assert.equal(err.respCode, 40302);
    assert.equal(typeof err.respCode, 'number');
    return true;
  });
});

test('non-2xx with non-JSON body throws SmobilpayApiException with null apiError', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueText(502, '<html>bad gateway</html>');
  await assert.rejects(() => transport.get('/v2/ping'), (err) => {
    assert.ok(err instanceof SmobilpayApiException);
    assert.equal(err.httpStatus, 502);
    assert.equal(err.apiError, null);
    assert.equal(err.rawBody, '<html>bad gateway</html>');
    return true;
  });
});

test('malformed JSON success body throws SmobilpayError', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueText(200, 'not-json');
  await assert.rejects(() => transport.get('/v2/ping'), (err) => {
    assert.ok(err instanceof SmobilpayError);
    assert.match(err.message, /parse response body/);
    return true;
  });
});

test('network failure wraps as SmobilpayError', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueError(new Error('socket hang up'));
  await assert.rejects(() => transport.get('/v2/ping'), (err) => {
    assert.ok(err instanceof SmobilpayError);
    assert.match(err.message, /transport error/);
    return true;
  });
});

test('path without leading slash is normalised', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueJson(200, {});
  await transport.get('v2/ping');
  assert.equal(fetchImpl.lastCall().url, 'https://api.example.invalid/v2/ping');
});

test('post without body sends no body field', async () => {
  const { fetchImpl, transport } = makeSetup();
  fetchImpl.queueJson(200, {});
  await transport.post('/v2/somepath');
  assert.equal(fetchImpl.lastCall().init.body, undefined);
});

// --- reactive 401 refresh + retry (MPAY-30042) ---

function makeRetrySetup() {
  const fetchImpl = createMockFetch();
  const cfg = createConfig({
    baseUrl: 'https://api.example.invalid',
    publicKey: 'pk',
    secretKey: 'sk',
    apiVersion: '3.2.0',
    fetch: fetchImpl,
  });
  let refreshed = 0;
  const tokenManager = {
    accessToken: async () => 'bearer-stale',
    refresh: async () => {
      refreshed += 1;
      return 'bearer-fresh';
    },
  };
  return { fetchImpl, transport: createTransport(cfg, tokenManager), refreshCount: () => refreshed };
}

test('get refreshes token and retries once on 401, then succeeds', async () => {
  const { fetchImpl, transport, refreshCount } = makeRetrySetup();
  fetchImpl.queueText(401, '');
  fetchImpl.queueJson(200, { version: '3.0.0' });
  const result = await transport.get('/v2/ping');
  assert.deepEqual(result, { version: '3.0.0' });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer bearer-stale');
  assert.equal(fetchImpl.calls[1].init.headers.Authorization, 'Bearer bearer-fresh');
  assert.equal(refreshCount(), 1);
});

test('get retries at most once — persistent 401 surfaces SmobilpayApiException', async () => {
  const { fetchImpl, transport, refreshCount } = makeRetrySetup();
  fetchImpl.queueText(401, '');
  fetchImpl.queueJson(401, { respCode: 41004, devMsg: 'unauthorized' });
  await assert.rejects(() => transport.get('/v2/ping'), (err) => {
    assert.ok(err instanceof SmobilpayApiException);
    assert.equal(err.httpStatus, 401);
    return true;
  });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(refreshCount(), 1);
});

test('post retries on 401 with the refreshed bearer and resent body', async () => {
  const { fetchImpl, transport } = makeRetrySetup();
  fetchImpl.queueText(401, '');
  fetchImpl.queueJson(200, { quoteId: 'abc' });
  const body = { amount: 500, payItemId: 'PI' };
  const result = await transport.post('/v2/quotestd', body);
  assert.deepEqual(result, { quoteId: 'abc' });
  assert.equal(fetchImpl.calls.length, 2);
  const retry = fetchImpl.calls[1];
  assert.equal(retry.init.headers.Authorization, 'Bearer bearer-fresh');
  assert.equal(retry.init.headers['Content-Type'], 'application/json');
  assert.equal(retry.init.body, JSON.stringify(body));
});
