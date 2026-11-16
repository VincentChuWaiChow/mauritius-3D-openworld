import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJSON, parseOSM } from '../src/data-source.js';

const response = data => ({ ok: true, json: async () => data });

test('fetchJSON returns JSON and forwards request options with an internal signal', async () => {
  const controller = new AbortController();
  let received;
  const data = await fetchJSON('/map.json', {
    signal: controller.signal, method: 'POST', body: 'query',
    fetchImpl: async (url, options) => { received = { url, options }; return response({ elements: [] }); },
  });
  assert.deepEqual(data, { elements: [] });
  assert.equal(received.url, '/map.json');
  assert.equal(received.options.method, 'POST');
  assert.equal(received.options.body, 'query');
  assert.notEqual(received.options.signal, controller.signal);
  controller.abort();
  assert.equal(received.options.signal.aborted, false, 'successful requests remove the caller abort listener');
});

test('fetchJSON rejects HTTP failures without attempting to parse the error page', async () => {
  await assert.rejects(fetchJSON('/map.json', {
    fetchImpl: async () => ({ ok: false, status: 429, json: () => assert.fail('error body must not be parsed') }),
  }), /HTTP 429/);
});

test('fetchJSON preserves network and malformed JSON failures', async () => {
  const networkError = new TypeError('Network unavailable');
  const jsonError = new SyntaxError('Not JSON');
  await assert.rejects(fetchJSON('/map.json', { fetchImpl: async () => { throw networkError; } }), error => error === networkError);
  await assert.rejects(fetchJSON('/map.json', {
    fetchImpl: async () => ({ ok: true, json: async () => { throw jsonError; } }),
  }), error => error === jsonError);
});

test('fetchJSON deadline bounds both an unresponsive fetch and an unresponsive JSON body', async () => {
  for (const phase of ['fetch', 'json']) {
    let signal;
    await assert.rejects(fetchJSON('/map.json', {
      timeoutMs: 5,
      fetchImpl: async (_url, options) => {
        signal = options.signal;
        if (phase === 'fetch') return new Promise(() => {});
        return { ok: true, json: () => new Promise(() => {}) };
      },
    }), { name: 'TimeoutError' });
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, 'TimeoutError');
  }
});

test('fetchJSON caller cancellation is distinct from a timeout, even for a non-cooperating fetch', async () => {
  const controller = new AbortController();
  let internalSignal;
  const pending = fetchJSON('/map.json', {
    signal: controller.signal,
    fetchImpl: (_url, options) => {
      internalSignal = options.signal;
      return new Promise(() => {});
    },
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(internalSignal.aborted, true);
});

test('fetchJSON does not start an already-cancelled request and rejects invalid deadlines', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchJSON('/map.json', {
    signal: controller.signal, fetchImpl: () => assert.fail('cancelled fetch must not run'),
  }), { name: 'AbortError' });
  for (const timeoutMs of [0, -1, Infinity, NaN]) {
    await assert.rejects(fetchJSON('/map.json', { timeoutMs, fetchImpl: () => assert.fail('invalid timeout') }), RangeError);
  }
});

test('parseOSM rejects invalid envelopes and Overpass error remarks', () => {
  for (const result of [null, [], {}, { elements: {} }, { elements: [], remark: 'runtime error: query timed out' }]) {
    assert.throws(() => parseOSM(result), /Invalid OSM|Overpass/);
  }
});

test('parseOSM preserves valid ways and nodes but drops entire invalid geometries', () => {
  const first = { lat: -20.16, lon: 57.5 }, second = { lat: -20.15, lon: 57.51 };
  const way = { type: 'way', id: 42, tags: { highway: 'residential' }, geometry: [first, second] };
  const node = { type: 'node', id: 43, lat: first.lat, lon: first.lon, tags: { natural: 'tree' } };
  const source = { version: 0.6, elements: [
    way, node, null, { type: 'relation' },
    { ...way, geometry: [first, { lat: NaN, lon: 57.5 }, second] },
    { ...way, geometry: [first, { lat: -20, lon: Infinity }] },
    { ...way, geometry: [first, { lat: '-20', lon: 57.5 }] },
    { ...way, geometry: [first] }, { ...way, geometry: null },
    { ...node, lat: 91 }, { ...node, lon: -181 },
  ] };
  const parsed = parseOSM(source);
  assert.equal(parsed.version, 0.6);
  assert.deepEqual(parsed.elements, [way, node]);
  assert.equal(source.elements.length, 11, 'validation does not mutate input');
  assert.deepEqual(parseOSM({ elements: [] }).elements, []);
});
