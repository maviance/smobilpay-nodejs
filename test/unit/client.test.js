'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createClient } = require('../../src/client');
const { createMockFetch } = require('./_helpers/mock-fetch');

function makeFakeFetch() {
  const fetchImpl = createMockFetch();
  fetchImpl.queueJson(200, { access_token: 'bearer-x', expires_in: 3600 });
  return fetchImpl;
}

test('createClient exposes all API surfaces', () => {
  const client = createClient({
    baseUrl: 'https://api.example.invalid',
    publicKey: 'pk',
    secretKey: 'sk',
    fetch: makeFakeFetch(),
  });
  assert.equal(typeof client.tokens.accessToken, 'function');
  assert.equal(typeof client.masterdata.merchants, 'function');
  assert.equal(typeof client.initiate.quote, 'function');
  assert.equal(typeof client.confirm.collect, 'function');
  assert.equal(typeof client.verify.ping, 'function');
  assert.equal(typeof client.accountValidation.validateAccount, 'function');
  assert.equal(client.config.apiVersion, '3.0.0');
});

test('returned client is frozen', () => {
  const client = createClient({
    baseUrl: 'https://api.example.invalid',
    publicKey: 'pk',
    secretKey: 'sk',
    fetch: makeFakeFetch(),
  });
  assert.ok(Object.isFrozen(client));
  assert.throws(() => { client.masterdata = null; });
});

test('end-to-end: ping triggers token mint + authed GET', async () => {
  const fetchImpl = createMockFetch();
  fetchImpl.queueJson(200, { access_token: 'bearer-x', expires_in: 3600 });
  fetchImpl.queueJson(200, {
    time: '2026-05-27T10:00:00+00:00',
    version: '3.0.0',
    nonce: 'abc',
    key: 'pk',
  });

  const client = createClient({
    baseUrl: 'https://api.example.invalid',
    publicKey: 'pk',
    secretKey: 'sk',
    fetch: fetchImpl,
  });

  const pong = await client.verify.ping();
  assert.equal(pong.version, '3.0.0');
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].url, 'https://api.example.invalid/oauth/token');
  assert.equal(fetchImpl.calls[1].url, 'https://api.example.invalid/v2/ping');
  assert.equal(fetchImpl.calls[1].init.headers.Authorization, 'Bearer bearer-x');
});
