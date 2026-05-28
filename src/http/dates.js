'use strict';

/**
 * Date helpers used by the history endpoints. Produces the ISO-8601 offset
 * wire format (`timestamp_from` / `timestamp_to`) required by the partner
 * spec for `/v2/historystd` date-range queries.
 */

/**
 * Coerce a `Date`, ISO-8601 string, or `"YYYY-MM-DD"` to a Date pinned to
 * the start of that calendar day in UTC.
 *
 * @param {Date|string} input
 * @returns {Date}
 */
function startOfUtcDay(input) {
  const d = toDate(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Coerce a `Date`, ISO-8601 string, or `"YYYY-MM-DD"` to a Date pinned to
 * the **end** of that calendar day in UTC (23:59:59.000).
 *
 * @param {Date|string} input
 * @returns {Date}
 */
function endOfUtcDay(input) {
  const d = toDate(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 0));
}

/**
 * Format a `Date` as an ISO-8601 offset datetime with an explicit `+00:00`
 * offset — the wire format the Smobilpay server accepts on `historystd`.
 *
 * @param {Date} d
 * @returns {string} e.g. `2026-05-27T00:00:00+00:00`
 */
function toIsoOffsetDateTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError('toIsoOffsetDateTime: expected a valid Date');
  }
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${year}-${month}-${day}T${hh}:${mm}:${ss}+00:00`;
}

function toDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new TypeError('expected a valid Date');
    }
    return input;
  }
  if (typeof input === 'string') {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input.trim());
    const isoInput = dateOnly ? `${input.trim()}T00:00:00Z` : input;
    const d = new Date(isoInput);
    if (Number.isNaN(d.getTime())) {
      throw new TypeError(`unable to parse date string: ${input}`);
    }
    return d;
  }
  throw new TypeError(`expected Date or ISO-8601 string, got ${typeof input}`);
}

module.exports = {
  startOfUtcDay,
  endOfUtcDay,
  toIsoOffsetDateTime,
};
