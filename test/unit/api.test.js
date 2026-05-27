'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMasterdataApi } = require('../../src/api/masterdata');
const { createInitiateApi } = require('../../src/api/initiate');
const { createConfirmApi } = require('../../src/api/confirm');
const { createVerifyApi } = require('../../src/api/verify');
const { createAccountValidationApi } = require('../../src/api/account-validation');

function createStubTransport() {
  const calls = [];
  const stub = {
    calls,
    get(path, query) {
      calls.push({ method: 'GET', path, query });
      return Promise.resolve(stub._next);
    },
    post(path, body) {
      calls.push({ method: 'POST', path, body });
      return Promise.resolve(stub._next);
    },
    setNext(value) {
      stub._next = value;
    },
    _next: undefined,
  };
  return stub;
}

// ---- Masterdata ----------------------------------------------------------

test('masterdata.merchants → GET /v2/merchant', async () => {
  const transport = createStubTransport();
  const api = createMasterdataApi(transport);
  await api.merchants();
  assert.deepEqual(transport.calls[0], { method: 'GET', path: '/v2/merchant', query: undefined });
});

test('masterdata.services → GET /v2/service', async () => {
  const transport = createStubTransport();
  await createMasterdataApi(transport).services();
  assert.equal(transport.calls[0].path, '/v2/service');
});

test('masterdata.products forwards serviceid', async () => {
  const transport = createStubTransport();
  await createMasterdataApi(transport).products(123);
  assert.deepEqual(transport.calls[0], { method: 'GET', path: '/v2/product', query: { serviceid: 123 } });
});

test('masterdata payment-item endpoints all hit the right path', async () => {
  const transport = createStubTransport();
  const api = createMasterdataApi(transport);
  await api.vouchers(1);
  await api.topups(2);
  await api.cashins(3);
  await api.cashouts(4);
  assert.deepEqual(transport.calls.map((c) => c.path), [
    '/v2/voucher',
    '/v2/topup',
    '/v2/cashin',
    '/v2/cashout',
  ]);
});

// ---- Initiate ------------------------------------------------------------

test('initiate.bills validates required args and hits /v2/bill', async () => {
  const transport = createStubTransport();
  const api = createInitiateApi(transport);
  await api.bills('ENEO', 10039, '203157530');
  assert.deepEqual(transport.calls[0], {
    method: 'GET',
    path: '/v2/bill',
    query: { merchant: 'ENEO', serviceid: 10039, serviceNumber: '203157530' },
  });
  assert.throws(() => api.bills('', 10039, '203157530'), /merchant/);
  assert.throws(() => api.bills('ENEO', 'nope', '203157530'), /serviceid/);
  assert.throws(() => api.bills('ENEO', 10039, ''), /serviceNumber/);
});

test('initiate.subscriptions requires serviceNumber XOR customerNumber', async () => {
  const transport = createStubTransport();
  const api = createInitiateApi(transport);
  await api.subscriptions('CMSABC', 5000, '0000000101', null);
  assert.deepEqual(transport.calls[0].query, {
    merchant: 'CMSABC',
    serviceid: 5000,
    serviceNumber: '0000000101',
    customerNumber: null,
  });
  assert.throws(() => api.subscriptions('CMSABC', 5000, null, null), /serviceNumber or customerNumber/);
});

test('initiate.quote validates amount + payItemId and POSTs JSON', async () => {
  const transport = createStubTransport();
  const api = createInitiateApi(transport);
  await api.quote({ amount: 500, payItemId: 'PI-1' });
  assert.deepEqual(transport.calls[0], {
    method: 'POST',
    path: '/v2/quotestd',
    body: { amount: 500, payItemId: 'PI-1' },
  });
  assert.throws(() => api.quote({ amount: 0, payItemId: 'P' }), /amount/);
  assert.throws(() => api.quote({ amount: 1.5, payItemId: 'P' }), /amount/);
  assert.throws(() => api.quote({ amount: 100, payItemId: '' }), /payItemId/);
});

// ---- Confirm -------------------------------------------------------------

test('confirm.collect validates required fields', () => {
  const transport = createStubTransport();
  const api = createConfirmApi(transport);
  assert.throws(() => api.collect({ customerPhonenumber: 'x', customerEmailaddress: 'y@z' }), /quoteId/);
  assert.throws(() => api.collect({ quoteId: 'q', customerEmailaddress: 'y@z' }), /customerPhonenumber/);
  assert.throws(() => api.collect({ quoteId: 'q', customerPhonenumber: 'x' }), /customerEmailaddress/);
});

test('confirm.collect rejects oversize tag and callbackUrl', () => {
  const transport = createStubTransport();
  const api = createConfirmApi(transport);
  const base = { quoteId: 'q', customerPhonenumber: 'p', customerEmailaddress: 'e@e' };
  assert.throws(() => api.collect({ ...base, tag: 't'.repeat(51) }), /tag/);
  assert.throws(() => api.collect({ ...base, callbackUrl: 'u'.repeat(256) }), /callbackUrl/);
});

test('confirm.collect strips null/undefined optional fields before POST', async () => {
  const transport = createStubTransport();
  const api = createConfirmApi(transport);
  await api.collect({
    quoteId: 'q',
    customerPhonenumber: 'p',
    customerEmailaddress: 'e@e',
    customerName: undefined,
    customerAddress: null,
    trid: 'TRID-1',
  });
  assert.deepEqual(transport.calls[0], {
    method: 'POST',
    path: '/v2/collectstd',
    body: {
      quoteId: 'q',
      customerPhonenumber: 'p',
      customerEmailaddress: 'e@e',
      trid: 'TRID-1',
    },
  });
});

// ---- Verify --------------------------------------------------------------

test('verify.ping / verify.account hit correct paths', async () => {
  const transport = createStubTransport();
  const api = createVerifyApi(transport);
  await api.ping();
  await api.account();
  assert.deepEqual(transport.calls.map((c) => c.path), ['/v2/ping', '/v2/account']);
});

test('verify.verifyTransaction requires ptn or trid', async () => {
  const transport = createStubTransport();
  const api = createVerifyApi(transport);
  await api.verifyTransaction('PTN-1', null);
  assert.deepEqual(transport.calls[0].query, { ptn: 'PTN-1', trid: null });
  assert.throws(() => api.verifyTransaction(null, null), /ptn or trid/);
});

test('verify history lookups hit /v2/historystd with the right param', async () => {
  const transport = createStubTransport();
  const api = createVerifyApi(transport);
  await api.historyByPtn('PTN-1');
  await api.historyByTrid('TRID-1');
  assert.deepEqual(transport.calls.map((c) => c.query), [
    { ptn: 'PTN-1' },
    { trid: 'TRID-1' },
  ]);
});

test('verify.historyByDateRange formats UTC start/end with offset', async () => {
  const transport = createStubTransport();
  const api = createVerifyApi(transport);
  await api.historyByDateRange('2026-05-20', '2026-05-27');
  assert.deepEqual(transport.calls[0].query, {
    timestamp_from: '2026-05-20T00:00:00+00:00',
    timestamp_to:   '2026-05-27T23:59:59+00:00',
  });
});

test('verify.historyByDateRange rejects inverted range', () => {
  const api = createVerifyApi(createStubTransport());
  assert.throws(() => api.historyByDateRange('2026-05-27', '2026-05-20'), /before from/);
});

// ---- AccountValidation ---------------------------------------------------

test('accountValidation.verifyServiceNumber coerces non-true response to false', async () => {
  const transport = createStubTransport();
  const api = createAccountValidationApi(transport);
  transport.setNext(true);
  assert.equal(await api.verifyServiceNumber('ENEO', 1001, '203157530'), true);
  transport.setNext('not-a-bool');
  assert.equal(await api.verifyServiceNumber('ENEO', 1001, '203157530'), false);
  assert.deepEqual(transport.calls[0].query, { merchant: 'ENEO', serviceid: 1001, serviceNumber: '203157530' });
});

test('accountValidation.validateAccount uses camelCase serviceId per spec', async () => {
  const transport = createStubTransport();
  const api = createAccountValidationApi(transport);
  await api.validateAccount('677389120', 20053);
  assert.deepEqual(transport.calls[0], {
    method: 'GET',
    path: '/v2/validate',
    query: { destination: '677389120', serviceId: 20053 },
  });
});

test('accountValidation rejects missing args', () => {
  const api = createAccountValidationApi(createStubTransport());
  assert.throws(() => api.verifyServiceNumber('', 1, 'sn'), /merchant/);
  assert.throws(() => api.validateAccount('', 1), /destination/);
});
