// Run against local Vite with VITE_MAPBOX_PUBLIC_TOKEN=pk.fixture, never a real token.
// All provider requests are mocked; this does not establish Mauritius coverage.
import assert from 'node:assert/strict';
import {PbfWriter} from 'pbf';

const pbf = new PbfWriter();
pbf.writeMessage(3, (_, layer) => {
  layer.writeVarintField(15, 2);
  layer.writeStringField(1, 'traffic');
  layer.writeStringField(3, 'congestion');
  layer.writeMessage(4, (_, value) => value.writeStringField(1, 'heavy'));
  layer.writeMessage(2, (_, feature) => {
    feature.writePackedVarint(2, [0, 0]);
    feature.writeVarintField(3, 2);
    feature.writePackedVarint(4, [9, 200, 200, 10, 60, 80]);
  });
});
const body = Buffer.from(pbf.finish()).toString('base64');
const debuggerURL = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9238';
const tab = await (await fetch(debuggerURL + '/json/new?about:blank', {method: 'PUT'})).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => ws.onopen = resolve);
let id = 0;
const pending = new Map(), errors = [], requests = [];
ws.onmessage = ({data}) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Network.requestWillBeSent') requests.push(new URL(message.params.request.url).pathname);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id;
  const timer = setTimeout(() => {pending.delete(key); reject(Error('CDP timeout: ' + method));}, 20_000);
  pending.set(key, {resolve, reject, timer});
  ws.send(JSON.stringify({id: key, method, params}));
});
const ev = async expression => {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (expression, label) => {
  for (let i = 0; i < 100; i++) {if (await ev(expression)) return; await sleep(200);}
  throw Error('Timed out: ' + label);
};
const toggle = () => ev("document.getElementById('flow-enabled').click()");
const mock = () => ev('({calls:__trafficMock.calls.length,aborted:__trafficMock.aborted})');
const decoderRequests = () => requests.filter(path => /(?:vector[-_]tile|\/pbf)[^/]*\.js$/.test(path));
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `
    const originalFetch = window.fetch.bind(window), originalNow = Date.now;
    window.__trafficMock = {calls: [], pending: [], aborted: 0, mode: 200, offset: 0};
    Date.now = () => originalNow() + __trafficMock.offset;
    window.fetch = async (input, options = {}) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      if (url.hostname === 'api.mapbox.com') {
        const mock = __trafficMock;
        mock.calls.push(url.pathname);
        options.signal?.addEventListener('abort', () => mock.aborted++, {once: true});
        const response = () => new Response(Uint8Array.from(atob(${JSON.stringify(body)}), c => c.charCodeAt(0)));
        if (mock.mode === 'hold') return new Promise(resolve => mock.pending.push(() => resolve(response())));
        if (mock.mode === 'empty') return new Response(new Uint8Array());
        return mock.mode === 200 ? response() : new Response(null, {status: mock.mode});
      }
      if (url.origin !== location.origin) return new Response(null, {status: 503});
      return originalFetch(input, options);
    };
  `});
  await send('Page.navigate', {url: process.env.APP_URL || 'http://127.0.0.1:4173/mauritius-3D-openworld/'});
  await waitFor('window.__MU_TEST__?.().region', 'explorer initialization');
  await sleep(1200);
  assert.equal((await mock()).calls, 0, 'Traffic must be opt-in');
  assert.equal(decoderRequests().length, 0, 'Traffic decoders must not load at startup');
  assert.equal(await ev("document.getElementById('flow-enabled').disabled"), process.env.EXPECT_TRAFFIC_TOKEN === '0');
  await waitFor("document.querySelector('#flow-credit img').complete", 'logo load');
  assert.ok(await ev("document.querySelector('#flow-credit img').naturalWidth > 0"),
    'Logo must be a decodable SVG: ' + await ev("JSON.stringify({src:document.querySelector('#flow-credit img').src,complete:document.querySelector('#flow-credit img').complete})"));
  if (process.env.EXPECT_TRAFFIC_TOKEN !== '0') {
    await ev("__trafficMock.mode = 'empty'"); await toggle();
    await waitFor("document.getElementById('flow-status').textContent.includes('No reported')", 'empty 200 coverage');
    assert.equal(decoderRequests().length, 0, 'Empty responses must not download decoders');
    await toggle(); await ev('__trafficMock.mode = 200');
    await toggle();
    await waitFor('__MU_TEST__().trafficLines === 1 && __MU_TEST__().trafficMeshes === 1', 'decoded ribbon');
    assert(decoderRequests().length >= 2, 'A nonempty response must load both decoder modules');
    const vertices = await ev('__MU_TEST__().trafficVertices');
    assert(vertices > 0);
    assert.equal(await ev("document.getElementById('flow-credit').hidden"), false);
    const first = await mock();
    await sleep(1200);
    assert.equal((await mock()).calls, first.calls, 'Stationary camera must not fetch every frame');
    await ev('__trafficMock.offset += 480001');
    await waitFor(`__trafficMock.calls.length > ${first.calls}`, 'eight-minute refresh');
    await waitFor('__MU_TEST__().trafficLines === 1', 'refreshed ribbon');
    assert.equal(await ev('__MU_TEST__().trafficVertices'), vertices, 'Refresh must replace, not accumulate geometry');
    await toggle();
    assert.equal(await ev('__MU_TEST__().trafficMeshes'), 0);
    const stopped = (await mock()).calls;
    await sleep(1000);
    assert.equal((await mock()).calls, stopped);

    // Deliberately resolve a request after cancellation to exercise request identity.
    await ev("__trafficMock.mode = 'hold'"); await toggle();
    await waitFor('__trafficMock.pending.length === 1', 'pending request');
    const aborted = (await mock()).aborted;
    await ev("Object.defineProperty(document, 'hidden', {configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
    assert((await mock()).aborted > aborted, 'Hiding the tab must cancel in-flight traffic');
    await ev('__trafficMock.pending.shift()()'); await sleep(200);
    assert.equal(await ev('__MU_TEST__().trafficMeshes'), 0, 'Late hidden-tab response must not render');
    await ev("__trafficMock.mode = 204;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor("document.getElementById('flow-status').textContent.includes('No reported')", 'empty coverage');
    await toggle(); await ev('__trafficMock.mode = 403'); await toggle();
    await waitFor("document.getElementById('flow-status').textContent.includes('403')", 'access error');
    await toggle(); await ev('__trafficMock.mode = 200'); await toggle();
    await waitFor('__MU_TEST__().trafficLines === 1', 'manual retry');
    const previousKey = await ev('__MU_TEST__().trafficKey');
    await ev("document.querySelector('[data-region=grand-baie]').click()");
    await waitFor(`__MU_TEST__().trafficKey !== ${JSON.stringify(previousKey)} && __MU_TEST__().trafficLines === 1`, 'new centre tile');
    await ev("document.getElementById('overview').click()"); await sleep(1200);
    assert.equal(await ev('__MU_TEST__().trafficMeshes'), 0);
    assert.equal(await ev("document.getElementById('flow-credit').hidden"), true);
    const overviewCalls = (await mock()).calls;
    await ev('__trafficMock.offset += 480001'); await sleep(1000);
    assert.equal((await mock()).calls, overviewCalls, 'Overview must not fetch traffic');
  } else {
    assert.match(await ev("document.getElementById('flow-status').textContent"), /public token/);
  }
  assert.deepEqual(errors, []);
  console.log('Traffic browser PASS: mocked provider, token gate, SVG' + (process.env.EXPECT_TRAFFIC_TOKEN === '0' ? '' : ', rendering, refresh, cancellation, errors, tile change, overview cleanup'));
} finally {
  ws.close();
  await fetch(debuggerURL + '/json/close/' + tab.id);
}
