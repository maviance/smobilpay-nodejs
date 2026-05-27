'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SmobilpayError,
  SmobilpayAuthException,
  SmobilpayApiException,
} = require('../../src/errors');

test('SmobilpayError sets name and preserves cause', () => {
  const cause = new Error('boom');
  const err = new SmobilpayError('wrapped', cause);
  assert.equal(err.name, 'SmobilpayError');
  assert.equal(err.message, 'wrapped');
  assert.equal(err.cause, cause);
  assert.ok(err instanceof Error);
});

test('SmobilpayAuthException carries httpStatus and oauthError', () => {
  const err = new SmobilpayAuthException(401, 'invalid_client', 'mint failed');
  assert.equal(err.name, 'SmobilpayAuthException');
  assert.equal(err.httpStatus, 401);
  assert.equal(err.oauthError, 'invalid_client');
  assert.ok(err instanceof SmobilpayError);
});

test('SmobilpayApiException builds message from ApiError envelope', () => {
  const apiError = { respCode: 41004, devMsg: 'service does not exist', usrMsg: null, link: null };
  const err = new SmobilpayApiException(400, apiError, JSON.stringify(apiError));
  assert.equal(err.httpStatus, 400);
  assert.equal(err.apiError, apiError);
  assert.equal(err.respCode, 41004);
  assert.match(err.message, /respCode=41004/);
  assert.match(err.message, /service does not exist/);
});

test('SmobilpayApiException falls back to raw body when no envelope parsed', () => {
  const err = new SmobilpayApiException(502, null, '<html>bad gateway</html>');
  assert.equal(err.respCode, null);
  assert.match(err.message, /HTTP 502/);
  assert.match(err.message, /<html>/);
});

test('SmobilpayApiException handles empty body gracefully', () => {
  const err = new SmobilpayApiException(401, null, '');
  assert.match(err.message, /<empty body>/);
});
