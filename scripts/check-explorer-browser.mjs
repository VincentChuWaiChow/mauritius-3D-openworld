import assert from 'node:assert/strict';
const debuggerURL=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9238';
const tab=(await (await fetch(debuggerURL+'/json/list')).json()).find(x=>x.type==='page');
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let id=0,pending=new Map(),errs=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.exception?.description)};
const send=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const state=()=>ev('window.__MU_TEST__?.()');
await send('Runtime.enable');await send('Page.navigate',{url:process.env.APP_URL||'http://127.0.0.1:4173/mauritius-3D-openworld/'});
let s;for(let i=0;i<120;i++){await sleep(250);s=await state();if(s?.region)break;}
assert.ok(s?.buildingHits);
for(let i=0;i<100;i++){await sleep(200);s=await state();if(s.roamKey&&s.buildingHits>360)break;}
assert(s.buildingHits>360,'Town centre must load beyond the sparse 360-building preset');
assert(s.cachedTiles<=48,'Decoded tile cache must remain bounded');
console.log('streamed initial',s.view,s.buildingHits,s.cachedTiles);
await ev("document.getElementById('overview').click()");await sleep(1400);
s=await state();assert(s.overview&&s.view>=7500);console.log('overview',s.view);
const samples=await ev(`(async()=>{const c=document.querySelector('#world canvas');const samples=[];c.dispatchEvent(new WheelEvent('wheel',{deltaY:-400,clientX:innerWidth/2,clientY:innerHeight/2,cancelable:true}));for(let i=0;i<10;i++){await new Promise(requestAnimationFrame);samples.push(__MU_TEST__().view)}return samples})()`);console.log('wheel samples',samples);assert(new Set(samples).size>=3);
await ev(`for(let i=0;i<9;i++)document.querySelector('#world canvas').dispatchEvent(new WheelEvent('wheel',{deltaY:-400,clientX:innerWidth/2,clientY:innerHeight/2,cancelable:true}))`);
for(let i=0;i<40;i++){await sleep(250);s=await state();if(s.view<3.05&&s.roamKey&&!s.overview)break;}
console.log('interior',s);assert(s.view<3.05&&!s.overview&&s.roamKey&&s.buildingHits>0);
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW'});await sleep(650);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'});const m=await state();
assert(Math.hypot(m.target[0]-s.target[0],m.target[2]-s.target[2])>.2);assert.deepEqual(errs,[]);console.log('WASD passed');ws.close();
