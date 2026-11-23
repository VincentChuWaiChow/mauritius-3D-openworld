// Run against a production preview. External fetches return 503; no live provider is exercised.
// Optional: ROAD_SCREENSHOT_PREFIX=/tmp/road-browser (also accepts SCREENSHOT_PREFIX).
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('../public/explorer/roads/index.json', import.meta.url)));
const royals = fixture.roads.filter(road => road.name === 'Royal Road');
const first = royals.find(road => road.locality === 'Near New Grove');
const second = royals.find(road => road.locality === 'Near Pointe aux Piments');
const longest = fixture.roads.reduce((a, b) => a.name.length > b.name.length ? a : b);
assert(first && second && first.id !== second.id, 'Expected disambiguation fixtures');
const appURL = process.env.APP_URL || 'http://127.0.0.1:4173/mauritius-3D-openworld/';
const debuggerURL = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9238';
const prefix = process.env.ROAD_SCREENSHOT_PREFIX || process.env.SCREENSHOT_PREFIX;
const tab = await (await fetch(debuggerURL + '/json/new?about:blank', {method: 'PUT'})).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
const opened = new Promise((resolve, reject) => {ws.onopen = resolve; ws.onerror = reject;});
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
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id, timer = setTimeout(() => {pending.delete(key); reject(Error('CDP timeout: ' + method));}, 20_000);
  pending.set(key, {resolve, reject, timer}); ws.send(JSON.stringify({id: key, method, params}));
});
const ev = async expression => {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (expression, label) => {
  for (let i = 0; i < 100; i++) {if (await ev(expression)) return; await sleep(200);}
  throw Error('Timed out: ' + label + ' | ' + await ev('JSON.stringify(window.__MU_TEST__?.())'));
};
const click = selector => ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
const key = async (name, code = name) => {
  const windowsVirtualKeyCode = {ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27}[name];
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key: name, code, windowsVirtualKeyCode, ...(name === 'Enter' ? {text: '\r'} : {})});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: name, code, windowsVirtualKeyCode});
};
const query = text => ev(`{const input=document.getElementById('place-query');input.value=${JSON.stringify(text)};input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));}`);
const resultSelector = road => `[data-result-type="road"][data-road-id="${road.id}"]`;
const screenshot = async label => {
  if (prefix) writeFileSync(`${prefix}-${label}.png`, Buffer.from((await send('Page.captureScreenshot', {format: 'png'})).data, 'base64'));
};
const selected = async road => {
  await waitFor(`__MU_TEST__().roadSelection?.id===${JSON.stringify(road.id)} && __MU_TEST__().roadSelection.ready`, 'selected ' + road.id);
  await waitFor("!document.getElementById('road-locator').hidden", 'visible locator');
  assert.equal(await ev('__MU_TEST__().roadMeshes'), 2, 'One selection must have exactly two color-batched meshes');
  assert.deepEqual(await ev('__MU_TEST__().roadSelection.wayIds'), road.wayIds);
  for (const selector of ['#road-locator', '#road-selection']) assert.equal(await ev(`document.querySelectorAll('${selector}:not([hidden])').length`), 1);
  assert.equal(await ev("document.getElementById('road-selection-name').textContent"), road.name);
};
const choose = async (road, text = road.name) => {
  await query(text); await waitFor(`document.querySelector(${JSON.stringify(resultSelector(road))})`, 'road result ' + road.id);
  await click(resultSelector(road)); await selected(road);
};
const cleared = async () => {
  assert.equal(await ev('__MU_TEST__().roadSelection'), null);
  assert.equal(await ev('__MU_TEST__().roadMeshes'), 0);
  for (const selector of ['#road-selection', '#road-locator', '#road-tooltip']) assert.equal(await ev(`document.querySelector('${selector}').hidden`), true);
};
const navigate = async () => {
  await ev('delete window.__MU_TEST__'); // Do not mistake the previous document for a completed navigation.
  await send('Page.navigate', {url: appURL});
  await waitFor('window.__MU_TEST__?.().region', 'explorer initialization'); await sleep(1000);
};
try {
  await opened; await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false});
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `
    const originalFetch=window.fetch.bind(window);
    window.__roadMock={mode:sessionStorage.getItem('road-grader-mode')||'real',indexCalls:0,external:0};
    window.fetch=async(input,options={})=>{
      const url=new URL(input instanceof Request?input.url:input,location.href);
      if(url.origin!==location.origin){__roadMock.external++;return new Response(null,{status:503});}
      if(url.pathname.endsWith('/roads/index.json')){
        __roadMock.indexCalls++;
        if(__roadMock.mode==='error')return new Response(null,{status:503});
        if(__roadMock.mode==='empty')return new Response(JSON.stringify({version:1,roads:[]}),{headers:{'Content-Type':'application/json'}});
      }
      return originalFetch(input,options);
    };`});
  await navigate();
  assert.equal(await ev('__MU_TEST__().roadIndexReady'), false, 'Road data must be opt-in');
  assert.equal(await ev('__roadMock.indexCalls'), 0);
  assert.equal(requests.filter(url => /\/roads\/index\.json(?:[?#]|$)|\/assets\/roads-[^/]+\.js(?:[?#]|$)/.test(url)).length, 0,
    'Dedicated production road helper and index must not load before intent');

  await query('Sir Seewoosagur Ramgoolam Avenue Vacoas');
  await waitFor("document.querySelectorAll('[data-result-type=road]').length>1", 'same-locality duplicate results');
  const duplicates=await ev("[...document.querySelectorAll('[data-result-type=road]')].map(b=>b.textContent)");
  assert.equal(new Set(duplicates).size,duplicates.length,'Same name/locality/rounded-coordinate results must still have distinct visible identities');

  await query('Royal Road'); await waitFor("document.querySelectorAll('[data-result-type=road]').length>1", 'duplicate road results');
  const results = await ev("[...document.querySelectorAll('[data-result-type=road]')].map(b=>({id:b.dataset.roadId,name:b.querySelector('strong').textContent,locality:b.querySelector('small').textContent}))");
  assert(results.filter(road => road.name === 'Royal Road').length > 1);
  for (const result of results) assert(result.locality.includes(fixture.roads.find(road => road.id === result.id).locality), 'Every result must show its locality');
  await ev("document.getElementById('place-search-form').requestSubmit()"); await sleep(200);
  assert.equal(await ev('__MU_TEST__().roadSelection'), null, 'Ambiguous exact names must not auto-select');
  await click(resultSelector(first)); await selected(first); await sleep(1100);
  assert.equal(await ev('__MU_TEST__().roadCount'), fixture.roads.length);
  for (const theme of ['dusk', 'tropical', 'little']) {
    await ev(`{const el=document.getElementById('theme');el.value=${JSON.stringify(theme)};el.dispatchEvent(new Event('change'));}`);
    await selected(first);
  }
  await ev("{const el=document.getElementById('terrain-enabled');el.checked=false;el.dispatchEvent(new Event('change'));document.getElementById('height').dispatchEvent(new Event('input'));}");
  await selected(first);

  // Probe projected road segments using real pointer events; buildings retain hit priority.
  await click('#top'); await sleep(500);
  await waitFor('__MU_TEST__(true).roadSamples?.length>0', 'projected named-road samples');
  let hovered;
  for (const point of await ev('__MU_TEST__(true).roadSamples')) {
    await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: point.x, y: point.y}); await sleep(130);
    if (await ev('__MU_TEST__().roadHover')) {hovered = point; break;}
  }
  assert(hovered, 'At least one unobscured road must be hoverable');
  assert.equal(await ev("document.querySelectorAll('#road-tooltip:not([hidden])').length"), 1);
  assert(await ev("document.querySelector('#road-tooltip strong').textContent.length>0 && document.querySelector('#road-tooltip span').textContent.length>0"));
  await ev("document.getElementById('height').dispatchEvent(new Event('input'))");await sleep(250);
  assert(await ev('__MU_TEST__().roadHover'),'Stationary pointer recovers after an automatic world rebuild');
  await screenshot('desktop-hover');
  await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: 640, y: 50}); await sleep(150);
  assert.equal(await ev('__MU_TEST__().roadHover'), null, 'Leaving the canvas for the header clears hover');
  await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: hovered.x, y: hovered.y}); await sleep(150);
  await send('Input.dispatchMouseEvent', {type: 'mousePressed', x: hovered.x, y: hovered.y, button: 'right', buttons: 2, clickCount: 1});
  await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: hovered.x + 20, y: hovered.y + 20, button: 'right', buttons: 2});
  assert.equal(await ev('__MU_TEST__().roadHover'), null, 'Dragging cancels hover');
  await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: hovered.x + 20, y: hovered.y + 20, button: 'right', buttons: 0, clickCount: 1});
  await choose(second, 'Royal Road Pointe aux Piments'); await click('#clear-road'); await cleared();
  await query('Royal Road'); await waitFor("document.querySelectorAll('[data-result-type=road]').length>1", 'keyboard road results');
  await ev("document.getElementById('place-query').focus()"); await key('ArrowDown');
  const keyboardId = await ev('document.activeElement.dataset.roadId');
  assert(keyboardId, 'ArrowDown moves from input to a road result');
  await key('ArrowDown'); assert.notEqual(await ev('document.activeElement.dataset.roadId'), keyboardId);
  await key('ArrowUp'); assert.equal(await ev('document.activeElement.dataset.roadId'), keyboardId);
  await key('Enter'); await selected(fixture.roads.find(road => road.id === keyboardId)); await key('Escape'); await cleared();

  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
  await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
  await query(longest.name); await waitFor(`document.querySelector(${JSON.stringify(resultSelector(longest))})`, 'long road result');
  const touch = await ev(`{const b=document.querySelector(${JSON.stringify(resultSelector(longest))});b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`);
  await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [touch]});
  await send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await selected(longest);
  assert.equal(await ev("matchMedia('(prefers-reduced-motion: reduce)').matches"), true);
  const pose = await ev('({target:__MU_TEST__().target,view:__MU_TEST__().view})'); await sleep(250);
  assert.deepEqual(await ev('({target:__MU_TEST__().target,view:__MU_TEST__().view})'), pose, 'Reduced-motion selection must settle without a camera animation');
  assert(await ev("document.documentElement.scrollWidth<=innerWidth && document.getElementById('road-selection-name').scrollWidth<=document.getElementById('road-selection-name').clientWidth+1"), 'Long mobile names must not overflow');
  assert(await ev("document.getElementById('road-locator').getBoundingClientRect().top>document.getElementById('road-selection').getBoundingClientRect().bottom+12"),'Mobile locator must remain below the search/selection rail');
  await screenshot('mobile-selected'); await click('#overview'); await cleared();
  assert.equal(await ev('__MU_TEST__().overview'), true);
  assert(await ev('__MU_TEST__().cachedTiles<=48 && __MU_TEST__().roadGeometryBuckets<=4'), 'Caches must remain bounded');

  // Fresh documents isolate loader failure/empty states; a later input retries successfully.
  for (const mode of ['empty', 'error']) {
    await ev(`sessionStorage.setItem('road-grader-mode',${JSON.stringify(mode)})`); await navigate(); await query('zzzxqv-unmapped-road');
    await waitFor(mode === 'empty' ? "document.getElementById('search-status').textContent.includes('No mapped match')" : "document.getElementById('search-status').textContent.includes('Road names unavailable')", mode + ' index feedback');
    assert.equal(await ev('__MU_TEST__().roadCount'), 0); await cleared();
    if (mode === 'error') {await ev("__roadMock.mode='real';sessionStorage.removeItem('road-grader-mode')"); await choose(first); await click('#overview'); await cleared();}
  }
  assert(await ev('__MU_TEST__().overview && __MU_TEST__().cachedTiles<=48 && __MU_TEST__().roadGeometryBuckets<=4'));
  assert.deepEqual(errors, [], 'No uncaught JavaScript exceptions');
  console.log('Road browser PASS: lazy loading, local disambiguation, selection/rebuild/clear, hover/drag, keyboard, touch/reduced-motion, long names, empty/error recovery, cache bounds');
} finally {
  ws.close(); await fetch(debuggerURL + '/json/close/' + tab.id);
}
