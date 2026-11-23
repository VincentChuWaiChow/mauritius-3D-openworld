import assert from 'node:assert/strict';

const debuggerURL = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9238';
const appURL = process.env.APP_URL || 'http://127.0.0.1:4173/mauritius-3D-openworld/';
const tab = await (await fetch(debuggerURL + '/json/new?about:blank', {method: 'PUT'})).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => ws.onopen = resolve);
let id = 0;
const pending = new Map(), requests = [], responses = [], errors = [];
ws.onmessage = ({data}) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
  if (message.method === 'Network.requestWillBeSent') requests.push(new URL(message.params.request.url).pathname);
  if (message.method === 'Network.responseReceived') responses.push(message.params.response);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
    errors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
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
const count = suffix => requests.filter(path => path.endsWith(suffix)).length;
try {
  await send('Page.enable'); await send('Page.bringToFront'); await send('Runtime.enable'); await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `
    const originalFetch = fetch.bind(window);
    window.__failPlaceLoad = false;
    window.fetch = (input, options) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      if (url.origin !== location.origin) return Promise.resolve(new Response(null, {status: 503}));
      if (url.pathname.endsWith('/places.json') && __failPlaceLoad) {
        __failPlaceLoad = false;
        return Promise.resolve(new Response(null, {status: 503}));
      }
      return originalFetch(input, options);
    };
  `});
  await send('Page.navigate', {url: appURL});
  await waitFor('window.__MU_TEST__?.().buildingHits > 0', 'explorer first view');
  await sleep(1200);
  assert.equal(count('/places.json'), 0, 'Place index must not be a startup request');
  assert(!requests.some(path => /\/(scenery|vector-tile|pbf|traffic-decoder)-[^/]+\.js$/.test(path)),
    'Optional modules must not load at startup');
  const initialTextures = [...new Set(requests.filter(path => path.includes('/explorer/textures/')))];
  assert.equal(initialTextures.length === 0, await ev('__MU_TEST__().software'));

  await ev("__failPlaceLoad=true;document.getElementById('place-query').dispatchEvent(new Event('focus'))");
  await waitFor("document.getElementById('search-status').textContent.includes('retry')", 'search failure state');
  await ev("{const input=document.getElementById('place-query');input.value='Le Morne';input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('input'))}");
  await waitFor("document.querySelector('#place-results button')", 'first lazy search');
  assert.equal(count('/places.json'), 1, 'Concurrent input events must share the successful retry');
  await ev("document.querySelector('#place-results button').focus()");
  assert.equal(await ev("document.activeElement.matches('#place-results button')"), true);
  await ev("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await sleep(200);
  assert.equal(await ev("document.getElementById('place-results').hidden"), true, 'Escape must not reopen cached search results');
  assert.equal(await ev('document.activeElement.id'), 'place-query');
  await ev("{const input=document.getElementById('place-query');input.value='Moka';input.dispatchEvent(new Event('input'))}");
  await waitFor("!document.getElementById('place-results').hidden", 'cached search');
  assert.equal(count('/places.json'), 1);
  for (const path of initialTextures)
    assert.equal(requests.filter(item => item === path).length, 1, 'Material textures must be cached by name');
  assert.deepEqual(errors, []);
  console.log('Explorer lazy assets PASS:', {initialTextures: initialTextures.length, searchIndexRequests: count('/places.json')});

  requests.length = 0; responses.length = 0;
  await send('Page.navigate', {url: new URL('classic.html', appURL).href});
  await waitFor("document.querySelector('#app canvas') && document.getElementById('surfaceDetail')", 'classic initialization');
  await sleep(1500);
  for (const atlas of ['surface-atlas.png', 'building-atlas.png'])
    assert.equal(count('/' + atlas), 0, 'Classic must not download atlases at 0% texture');
  await ev("{const slider=document.getElementById('surfaceDetail');slider.value=65;slider.dispatchEvent(new Event('input'))}");
  for (let i = 0; i < 100 && responses.filter(response => /\/(surface|building)-atlas\.png$/.test(response.url) && response.status === 200).length < 2; i++)
    await sleep(100);
  for (const atlas of ['surface-atlas.png', 'building-atlas.png']) {
    assert.equal(count('/' + atlas), 1);
    assert(responses.some(response => response.url.endsWith('/' + atlas) && response.status === 200));
  }
  await ev("{const slider=document.getElementById('surfaceDetail');for(const value of [0,50]){slider.value=value;slider.dispatchEvent(new Event('input'))}}");
  await sleep(500);
  for (const atlas of ['surface-atlas.png', 'building-atlas.png']) assert.equal(count('/' + atlas), 1);
  assert.deepEqual(errors, []);
  console.log('Classic lazy atlases PASS: no startup downloads, both loaded successfully once on demand, no shader/JS errors');
} finally {
  ws.close(); await fetch(debuggerURL + '/json/close/' + tab.id);
}
