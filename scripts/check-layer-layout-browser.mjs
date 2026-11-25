// Local CDP check; provider requests are blocked. Start Chrome with remote debugging.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const debug=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9246';
const app=process.env.APP_URL||'http://localhost:4000/mauritius-3D-openworld/';
const output=process.env.SCREENSHOT_DIR||'/tmp/mauritius-layer-tiles';
const tab=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve=>ws.onopen=resolve);
let id=0;
const pending=new Map(),errors=[];
ws.onmessage=({data})=>{
  const m=JSON.parse(data);
  if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
};
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method));},20000);
  pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));
});
const ev=async expression=>{
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async expression=>{for(let i=0;i<100;i++){if(await ev(expression))return;await sleep(100);}throw Error('Timed out: '+expression);};
const reports=[];
try{
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['https://*']});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const context=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(t,...a){return /webgl/.test(t)?null:context.call(this,t,...a)};
    const f=window.fetch.bind(window);
    window.fetch=(input,options)=>new URL(input instanceof Request?input.url:input,location.href).origin===location.origin?f(input,options):Promise.resolve(new Response(null,{status:503}));
  `});
  await send('Page.navigate',{url:app});await wait('window.__MU_TEST__?.().region');
  await ev("document.querySelector('#layers-button').click()");
  assert.equal(await ev("document.querySelector('#layers-button').getAttribute('aria-expanded')"),'true');
  await mkdir(output,{recursive:true});
  for(const [width,height] of [[1440,900],[768,1024],[600,900],[480,800],[420,812],[375,812],[320,640],[960,540]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await sleep(250);
    const layout=await ev(`(()=>{
      const p=document.querySelector('#layers-panel'),grid=p.querySelector('.layer-grid');p.scrollTop=0;
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
      const tiles=[...grid.children].map(el=>({...rect(el),fontSize:parseFloat(getComputedStyle(el).fontSize),overflow:el.scrollWidth>el.clientWidth}));
      const b=rect(p);
      return {width:innerWidth,height:innerHeight,panel:b,scrollHeight:p.scrollHeight,grid:rect(grid),tiles,
        overflow:p.scrollWidth>p.clientWidth||document.documentElement.scrollWidth>innerWidth,
        columns:getComputedStyle(grid).gridTemplateColumns,metadataFont:parseFloat(getComputedStyle(p.querySelector('.layer-details')).fontSize),
        checkboxes:p.querySelectorAll('input[type=checkbox]').length};
    })()`);
    assert.equal(layout.checkboxes,8);
    const columns=width>=480?3:2;
    assert.equal(layout.columns.split(' ').length,columns,JSON.stringify(layout));
    assert.equal(new Set(layout.tiles.map(t=>Math.round(t.y))).size,Math.ceil(8/columns));
    assert.equal(layout.overflow,false,'panel/page horizontal overflow');
    assert.ok(layout.panel.x>=0&&layout.panel.right<=width+1&&layout.panel.y>=0&&layout.panel.bottom<=height+1,JSON.stringify(layout.panel));
    for(const tile of layout.tiles){assert.ok(tile.height>=44);assert.ok(tile.fontSize>=12);assert.equal(tile.overflow,false);}
    assert.ok(layout.metadataFont>=12);
    assert.ok(Math.abs(layout.tiles[0].width-layout.tiles[1].width)<1);
    await ev("document.querySelector('.traffic-token-settings').open=true");
    const tokenLayout=await ev("(()=>{const p=document.querySelector('#layers-panel');return {overflow:p.scrollWidth>p.clientWidth,controls:[...p.querySelectorAll('#traffic-token,.traffic-token-entry button')].map(e=>({height:e.getBoundingClientRect().height,font:parseFloat(getComputedStyle(e).fontSize)}))}})()");
    assert.equal(tokenLayout.overflow,false,'Open token form must not overflow');
    for(const c of tokenLayout.controls){assert.ok(c.height>=44);assert.ok(c.font>=12);}
    if(width===1440||width===375){
      await ev("document.querySelector('.traffic-token-settings').scrollIntoView({block:'start'})");
      const tokenShot=await send('Page.captureScreenshot',{format:'png'});
      await writeFile(`${output}/token-${width}.png`,Buffer.from(tokenShot.data,'base64'));
    }
    await ev("document.querySelector('.traffic-token-settings').open=false");
    await ev("document.querySelector('#panel-transparency').scrollIntoView({block:'end'})");
    const slider=await ev("(()=>{const s=document.querySelector('#panel-transparency').getBoundingClientRect(),p=document.querySelector('#layers-panel').getBoundingClientRect();return {top:s.top,bottom:s.bottom,panelTop:p.top,panelBottom:p.bottom}})()");
    // Scrolling uses integer offsets while DOM geometry retains fractional pixels.
    assert.ok(slider.top>=slider.panelTop-1&&slider.bottom<=slider.panelBottom+1,'last slider reachable: '+JSON.stringify({width,height,...slider}));
    await ev("document.querySelector('#layers-panel').scrollTop=0");
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${output}/${width}x${height}.png`,Buffer.from(shot.data,'base64'));
    reports.push(layout);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await sleep(150);
  const before=await ev("getComputedStyle(document.querySelector('[data-layer=roads]').closest('label')).backgroundColor");
  await ev("document.querySelector('[data-layer=roads]').closest('label').click()");
  assert.equal(await ev("document.querySelector('[data-layer=roads]').checked"),false);
  assert.notEqual(await ev("getComputedStyle(document.querySelector('[data-layer=roads]').closest('label')).backgroundColor"),before);
  await ev("document.querySelector('[data-layer=roads]').focus()");
  assert.equal(await ev("getComputedStyle(document.querySelector('[data-layer=roads]').closest('label')).outlineStyle"),'solid');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  assert.equal(await ev("document.querySelector('[data-layer=roads]').checked"),true,'keyboard Space toggles native checkbox');
  assert.equal(await ev("document.querySelector('#flow-enabled').disabled"),true);
  await ev("document.querySelector('#flow-enabled').closest('label').click()");
  assert.equal(await ev("document.querySelector('#flow-enabled').checked"),false,'disabled tile stays disabled');
  const longStatus='Port Louis model · 29.6 °C · 44% cloud · 0 mm / 15 min · wind 19 km/h · 09:00 MUT (12 min ago)';
  await ev(`document.querySelector('#weather-status').textContent=${JSON.stringify(longStatus+' '+longStatus)}`);
  for(const width of [1440,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:812,deviceScaleFactor:1,mobile:false});await sleep(100);
    assert.equal(await ev("(()=>{const p=document.querySelector('#layers-panel');return p.scrollWidth>p.clientWidth})()"),false,'long status wraps');
  }
  await ev("document.querySelector('#panel-transparency').value=40;document.querySelector('#panel-transparency').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await ev("document.querySelector('#transparency-value').value"),'40%');
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/measurements.json`,JSON.stringify(reports,null,2));
  console.log('Layer tiles browser PASS: eight viewports, adaptive three/two columns, 44px targets, containment, scrolling, long status, label/keyboard/disabled states and transparency slider.');
  console.log(JSON.stringify(reports.map(r=>({viewport:`${r.width}x${r.height}`,panelWidth:r.panel.width,panelHeight:r.panel.height,contentHeight:r.scrollHeight,gridHeight:r.grid.height}))));
  console.log('Screenshots: '+output);
}finally{
  ws.close();await fetch(debug+'/json/close/'+tab.id);
}
