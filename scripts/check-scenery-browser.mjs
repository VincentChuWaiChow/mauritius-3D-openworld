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
for(let i=0;i<100;i++){await sleep(250);if((await state())?.region)break;}
await sleep(1500);

await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
for(const [query,kind] of [['7 colors','w133131985'],['Chamarel Waterfall','n248643391'],['Le Morne Brabant','n828423453'],['Trou aux Cerfs','n1891384067'],['Grand Bassin','r1789151']]){
 await ev(`document.getElementById('place-query').value=${JSON.stringify(query)};document.getElementById('place-query').dispatchEvent(new Event('input'))`);
 for(let i=0;i<100&&!(await ev("document.querySelectorAll('#place-results button').length"));i++)await sleep(50);
 assert((await ev("document.querySelectorAll('#place-results button').length"))>0);
 await ev("document.querySelector('#place-results button').click()");
 let s;for(let i=0;i<80;i++){await sleep(200);s=await state();if(s.scenery.includes(kind)&&s.sceneryMeshes>0)break;}
 assert(s.scenery.includes(kind),JSON.stringify({query,state:s}));await sleep(1500);console.log(query,await state());assert((await state()).cachedTiles<=48);
 if(['n828423453','n1891384067','r1789151'].includes(kind)){
  const other=['n828423453','n1891384067','r1789151'].filter(id=>id!==kind);
  assert(!(await state()).scenery.some(id=>other.includes(id)),'Previous distant landmark must unload');
 }
 const shot=await send('Page.captureScreenshot',{format:'png'});
 const fs=await import('node:fs');fs.writeFileSync((process.env.SCREENSHOT_PREFIX||'/tmp/mu-')+kind+'.png',Buffer.from(shot.data,'base64'));
 if(['n828423453','n1891384067','r1789151'].includes(kind)){
  await ev("document.getElementById('terrain-enabled').checked=false;document.getElementById('terrain-enabled').dispatchEvent(new Event('change'))");
  await sleep(1200);assert.equal((await state()).dem,false);assert((await state()).scenery.includes(kind));
  await ev("document.getElementById('terrain-enabled').checked=true;document.getElementById('terrain-enabled').dispatchEvent(new Event('change'))");
  await sleep(1200);assert((await state()).scenery.includes(kind));
 }

}
await ev("document.getElementById('terrain-enabled').checked=false;document.getElementById('terrain-enabled').dispatchEvent(new Event('change'))");
await sleep(1000);assert.equal((await state()).dem,false);assert((await state()).scenery.includes('r1789151'));
await ev("document.querySelector('[data-layer=nature]').click()");await sleep(250);
assert.equal((await state()).sceneryVisible,false);
await ev("document.querySelector('[data-layer=nature]').click()");await sleep(250);
assert.equal((await state()).sceneryVisible,true);
await ev("document.getElementById('overview').click()");await sleep(1500);assert.equal((await state()).scenery.length,0);
assert.deepEqual(errs,[]);console.log('Scenery search, load, overview disposal, no JS exceptions PASS');ws.close();
