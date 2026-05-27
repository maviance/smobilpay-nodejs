'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startOfUtcDay, endOfUtcDay, toIsoOffsetDateTime } = require('../../src/http/dates');

test('startOfUtcDay coerces ISO date string to 00:00:00 UTC', () => {
  const d = startOfUtcDay('2026-05-27');
  assert.equal(d.toISOString(), '2026-05-27T00:00:00.000Z');
});

test('endOfUtcDay coerces ISO date string to 23:59:59 UTC', () => {
  const d = endOfUtcDay('2026-05-27');
  assert.equal(d.toISOString(), '2026-05-27T23:59:59.000Z');
});

test('startOfUtcDay accepts Date instance', () => {
  const d = startOfUtcDay(new Date(Date.UTC(2026, 4, 27, 14, 30, 0)));
  assert.equal(d.toISOString(), '2026-05-27T00:00:00.000Z');
});

test('toIsoOffsetDateTime renders +00:00 offset', () => {
  const d = new Date(Date.UTC(2026, 4, 27, 0, 0, 0));
  assert.equal(toIsoOffsetDateTime(d), '2026-05-27T00:00:00+00:00');
});

test('toIsoOffsetDateTime pads single-digit components', () => {
  const d = new Date(Date.UTC(2026, 0, 1, 1, 2, 3));
  assert.equal(toIsoOffsetDateTime(d), '2026-01-01T01:02:03+00:00');
});

test('toIsoOffsetDateTime rejects invalid Date', () => {
  assert.throws(() => toIsoOffsetDateTime(new Date('not-a-date')), /valid Date/);
  assert.throws(() => toIsoOffsetDateTime('2026-05-27'), /Date/);
});

test('startOfUtcDay rejects garbage strings', () => {
  assert.throws(() => startOfUtcDay('garbage'), /parse/);
});
