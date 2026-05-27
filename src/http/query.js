'use strict';

/**
 * Build a URL-encoded query string preserving insertion order.
 *
 * `null` / `undefined` values are skipped so the caller can pass optional
 * parameters unconditionally — e.g. `{ merchant: m, serviceid: id,
 * customerNumber: maybeNull }` produces a clean URL when
 * `customerNumber` is absent.
 *
 * Booleans, numbers, and BigInts are coerced to their string form;
 * everything else uses `String(value)`.
 *
 * @param {Record<string, unknown> | Array<[string, unknown]>} params
 * @returns {string} encoded query string, **without** the leading `?`,
 *                   or the empty string if no parameters survived the filter.
 */
function buildQueryString(params) {
  const entries = normaliseEntries(params);
  const parts = [];
  for (const [name, value] of entries) {
    if (value === null || value === undefined) continue;
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}

function normaliseEntries(params) {
  if (params == null) return [];
  if (Array.isArray(params)) return params;
  return Object.entries(params);
}

module.exports = {
  buildQueryString,
};
