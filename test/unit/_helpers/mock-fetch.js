'use strict';

/**
 * Tiny mock `fetch` for tests. Records every call, returns a queued
 * response per call, fails the test if no response is queued.
 *
 *     const fetch = createMockFetch();
 *     fetch.queueJson(200, { ok: true });
 *     await someClientCall(fetch);
 *     assert.equal(fetch.calls.length, 1);
 *     assert.equal(fetch.calls[0].url, 'https://...');
 */
function createMockFetch() {
  const calls = [];
  const queue = [];

  const fn = async function mockFetch(url, init) {
    calls.push({ url: String(url), init: init || {} });
    if (queue.length === 0) {
      throw new Error(`mockFetch: no response queued for ${url}`);
    }
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return buildResponse(next);
  };

  fn.calls = calls;
  fn.queue = queue;
  fn.queueJson = (status, body, init = {}) => {
    queue.push({ status, body: JSON.stringify(body), ...init });
  };
  fn.queueText = (status, body, init = {}) => {
    queue.push({ status, body: String(body), ...init });
  };
  fn.queueError = (err) => {
    queue.push(err);
  };
  fn.lastCall = () => calls[calls.length - 1];
  return fn;
}

function buildResponse({ status, body, headers }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries(headers || {})),
    async text() {
      return body == null ? '' : String(body);
    },
    async json() {
      return JSON.parse(body);
    },
  };
}

module.exports = { createMockFetch };
