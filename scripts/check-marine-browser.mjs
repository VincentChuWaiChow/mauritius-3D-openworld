// Production CDP check. All external providers are blocked; no live marine claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const debug=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9249';
const app=process.env.APP_URL||'http://127.0.0.1:4189/mauritius-3D-openworld/';
const software=process.env.FORCE_SOFTWARE==='1',out=process.env.SCREENSHOT_DIR||'/tmp/mauritius-marine';
const tab=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[],requests=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
 if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){const message=m.params.args.map(a=>a.value??a.description).join(' ');if(!software||!message.includes('Error creating WebGL context'))errors.push(message);}
 if(m.method==='Network.requestWillBeSent')requests.push(new URL(m.params.request.url).pathname);
};
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},20000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(expression,attempts=120)=>{for(let i=0;i<attempts;i++){if(await ev(expression))return;await sleep(100);}throw Error('Timed out: '+expression);};
const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
const stats=()=>ev('__MU_TEST__().marine');
const query=text=>ev(`{const q=document.querySelector('#place-query');q.value=${JSON.stringify(text)};q.dispatchEvent(new Event('input',{bubbles:true}));}`);
async function choose(name){await query(name);const expression=`[...document.querySelectorAll('#place-results button')].find(b=>b.querySelector('strong').textContent===${JSON.stringify(name)})`;await wait(`!!(${expression})`);await ev(`(${expression}).click()`);await wait(`__MU_TEST__().marine?.meshCount>0 && document.querySelector('#region-name').textContent===${JSON.stringify(name)}`);}
async function shot(name){await mkdir(out,{recursive:true});const image=await send('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/${software?'software':'webgl'}-${name}.png`,Buffer.from(image.data,'base64'));}
try{
 await send('Page.enable');await send('Page.bringToFront');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  ${software?`const ctx=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return /webgl/.test(t)?null:ctx.call(this,t,...a)};`:''}
  const original=fetch.bind(window);window.__marineMock={mode:'real',calls:0,pending:[]};
  window.fetch=async(input,options)=>{const url=new URL(input instanceof Request?input.url:input,location.href);
   if(url.origin!==location.origin)return new Response(null,{status:503});
   if(url.pathname.endsWith('/marine/index.json')){__marineMock.calls++;if(__marineMock.mode==='error')return new Response(null,{status:503});
    if(__marineMock.mode==='malformed')return new Response(JSON.stringify({version:1,features:[{kind:'reef',geometry:{type:'Polygon',coordinates:[]}}]}),{headers:{'Content-Type':'application/json'}});
    if(__marineMock.mode==='hold')await new Promise(r=>__marineMock.pending.push(r));}
   return original(input,options);
  };
 `});
 await send('Page.navigate',{url:app});await wait('window.__MU_TEST__?.().region && document.querySelector("#loading").hidden');
 assert.equal(await ev('__MU_TEST__().software'),software);assert.equal(await ev('__marineMock.calls'),0);
 assert.equal(requests.some(p=>/marine-controls-.*\.js$/.test(p)),false,'No marine code at startup');
 // A never-resolving marine request must not hold ordinary road/place results.
 await ev("__marineMock.mode='hold'");await query('Royal Road');
 await wait("!!document.querySelector('#place-results [data-result-type=road]')",40);
 assert.equal(await ev('__marineMock.pending.length'),1,'Marine request is still pending while ordinary results are usable');
 await ev("window.__firstRoadResult=document.querySelector('#place-results [data-result-type=road]')");
 await ev("__marineMock.pending.splice(0).forEach(resolve=>resolve());__marineMock.mode='real'");
 await wait('__MU_TEST__().marine?.loaded');await sleep(100);
 assert.equal(await ev("window.__firstRoadResult===document.querySelector('#place-results [data-result-type=road]')"),true,'Irrelevant late marine results must not replace an in-progress road target');
 await ev("document.querySelector('#place-query').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
 await click('#overview');await wait('__MU_TEST__().overview');
 await click('#layers-button');await click('#marine-enabled');await wait('__MU_TEST__().marine?.meshCount>0');
 let initial=await stats();assert.equal(initial.featureCount,39);assert.ok(initial.meshCount<=5&&initial.triangleCount<=20000);
 assert.match(await ev("document.querySelector('#marine-status').textContent"),/29 mapped reefs.*10 lagoons/);
 const buffers=initial.bufferIds,geometries=initial.geometryIds;
 if(!software){await wait('__MU_TEST__().marine.waveTime>0');await sleep(900);
  const moving=(await send('Page.captureScreenshot',{format:'png'})).data;await sleep(200);assert.notEqual((await send('Page.captureScreenshot',{format:'png'})).data,moving,'Wave animation must change rendered ocean pixels');
  await click('#marine-waves');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const paused=(await stats()).waveTime;
  const frozen=(await send('Page.captureScreenshot',{format:'png'})).data;await sleep(400);assert.equal((await stats()).waveTime,paused);assert.equal((await send('Page.captureScreenshot',{format:'png'})).data,frozen,'Paused waves must leave pixels still');
  await click('#marine-waves');await wait(`__MU_TEST__().marine.waveTime>${paused}`);}
 else {assert.equal(initial.waveTime,0);assert.equal(await ev("document.querySelector('#marine-waves').disabled"),true);}
 await sleep(250);assert.deepEqual((await stats()).bufferIds,buffers);assert.deepEqual((await stats()).geometryIds,geometries);
 await shot('overview');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait("document.querySelector('#marine-waves').disabled");
 const stopped=(await stats()).waveTime;await sleep(350);assert.equal((await stats()).waveTime,stopped);
 await choose('Blue Bay Riff');assert.match(await ev("document.querySelector('#marine-source').href"),/openstreetmap\.org\/way\/486669260$/);
 assert.equal(await ev("document.querySelector('#marine-source').hidden"),false);await shot('reef');
 await click('#marine-enabled');assert.equal((await stats()).enabled,false);assert.equal((await stats()).meshCount??0,0);
 await choose('Paquet Bay');assert.match(await ev("document.querySelector('#marine-source').href"),/openstreetmap\.org\/way\/351208823$/);await shot('lagoon');
 const old=(await stats()).geometryIds;await ev("document.querySelector('#theme').value='dusk';document.querySelector('#theme').dispatchEvent(new Event('change'))");
 await wait("__MU_TEST__().theme==='dusk'");assert.notDeepEqual((await stats()).geometryIds,old);assert.equal((await stats()).meshCount,initial.meshCount);
 await click('#terrain-enabled');await click('#terrain-enabled');await wait("/fallback|unavailable/.test(document.querySelector('#terrain-status').textContent)");
 assert.equal((await stats()).featureCount,39);
 // Hidden tab must not advance the shared foreground motion clock.
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await sleep(200);
 const parked=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();
 try{
  const parkWs=new WebSocket(parked.webSocketDebuggerUrl);await new Promise(r=>parkWs.onopen=r);parkWs.send(JSON.stringify({id:1,method:'Page.bringToFront'}));
  await wait('document.hidden');const before=(await stats()).waveTime;await sleep(350);assert.equal((await stats()).waveTime,before);
  await send('Page.bringToFront');await wait('!document.hidden');await sleep(120);assert.ok((await stats()).waveTime-before<.4);parkWs.close();
 }finally{await fetch(debug+'/json/close/'+parked.id);}
 await click('#overview');await wait('__MU_TEST__().overview');assert.equal(await ev("document.querySelector('#marine-source').hidden"),true);
 for(let i=0;i<3;i++){await click('#marine-enabled');assert.equal((await stats()).meshCount??0,0);await click('#marine-enabled');await wait('__MU_TEST__().marine?.meshCount>0');assert.equal((await stats()).meshCount,initial.meshCount);}
 assert.equal(await ev('__marineMock.calls'),1,'Data remains cached across search, toggles and rebuilds');
 assert.equal(requests.filter(p=>/marine-controls-.*\.js$/.test(p)).length,1,'One lazy marine module load');
 await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});await sleep(150);
 if(await ev("document.querySelector('#layers-panel').hidden"))await click('#layers-button');
 const layout=await ev("(()=>{const p=document.querySelector('#layers-panel');return {overflow:p.scrollWidth>p.clientWidth,columns:getComputedStyle(p.querySelector('.layer-grid')).gridTemplateColumns.split(' ').length,target:document.querySelector('#marine-waves').getBoundingClientRect().height}})()");
 assert.equal(layout.overflow,false);assert.equal(layout.columns,2);assert.ok(layout.target>=44);await shot('mobile');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait("document.querySelector('#marine-waves').disabled");
 await choose('Coral reef near Bois des Amourettes');
 assert.ok(await ev('__MU_TEST__().view>2000'),'A large coral reef must not be cropped by the former 900-unit cap on a narrow screen');
 await query('w835050148');await wait('!!document.querySelector("#place-results [data-result-key=\\"place:w835050148\\"]")');
 assert.match(await ev('document.querySelector("#place-results [data-result-key=\\"place:w835050148\\"]").textContent'),/OSM w835050148/);
 await ev('document.querySelector("#place-results [data-result-key=\\"place:w835050148\\"]").click()');
 assert.match(await ev("document.querySelector('#marine-source').href"),/openstreetmap\.org\/way\/835050148$/);
 // Fresh document for UI-level retry and late-response tests, not just unit mocks.
 await ev('delete window.__MU_TEST__');await send('Page.reload',{ignoreCache:true});
 await wait('window.__MU_TEST__?.().region && document.querySelector("#loading").hidden');
 await ev("__marineMock.mode='error'");await click('#marine-enabled');await wait("document.querySelector('#marine-status').textContent.includes('unavailable')");
 assert.equal((await stats()).meshCount??0,0);await click('#marine-enabled');
 await ev("__marineMock.mode='hold'");await click('#marine-enabled');await wait('__marineMock.pending.length===1');await click('#marine-enabled');
 await ev("__marineMock.pending.splice(0).forEach(resolve=>resolve());__marineMock.mode='real'");await wait('__MU_TEST__().marine.loaded');
 assert.equal((await stats()).enabled,false);assert.equal((await stats()).meshCount??0,0,'Late response must not remount a disabled layer');
 await click('#marine-enabled');await wait('__MU_TEST__().marine.meshCount>0');assert.equal(await ev('__marineMock.calls'),2);
 // A successful HTTP response with bad geometry must not poison future retries.
 await ev('delete window.__MU_TEST__');await send('Page.reload',{ignoreCache:true});await wait('window.__MU_TEST__?.().region && document.querySelector("#loading").hidden');
 await ev("__marineMock.mode='malformed'");await click('#marine-enabled');await wait("document.querySelector('#marine-status').textContent.includes('unavailable')");
 await click('#marine-enabled');await ev("__marineMock.mode='real'");await click('#marine-enabled');await wait('__MU_TEST__().marine.meshCount>0');assert.equal(await ev('__marineMock.calls'),2);
 assert.deepEqual(errors,[],'No runtime or shader errors');
 console.log('Marine browser PASS: '+JSON.stringify({software,features:39,initial,requests:await ev('__marineMock.calls'),screenshots:out}));
}finally{ws.close();await fetch(debug+'/json/close/'+tab.id);}
