'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildQueryString } = require('../../src/http/query');

test('buildQueryString encodes simple params', () => {
  assert.equal(buildQueryString({ a: 1, b: 'two' }), 'a=1&b=two');
});

test('buildQueryString preserves insertion order', () => {
  assert.equal(buildQueryString({ b: 1, a: 2 }), 'b=1&a=2');
});

test('buildQueryString skips null and undefined values', () => {
  assert.equal(buildQueryString({ a: 1, b: null, c: undefined, d: 'x' }), 'a=1&d=x');
});

test('buildQueryString URL-encodes names and values', () => {
  assert.equal(
    buildQueryString({ 'service number': 'A B&C=D' }),
    'service%20number=A%20B%26C%3DD',
  );
});

test('buildQueryString returns empty for empty input', () => {
  assert.equal(buildQueryString({}), '');
  assert.equal(buildQueryString(null), '');
  assert.equal(buildQueryString(undefined), '');
});

test('buildQueryString accepts array of pairs and preserves duplicates', () => {
  assert.equal(
    buildQueryString([['k', '1'], ['k', '2']]),
    'k=1&k=2',
  );
});

test('buildQueryString coerces booleans and numbers', () => {
  assert.equal(buildQueryString({ a: true, b: 0, c: 1.5 }), 'a=true&b=0&c=1.5');
});
