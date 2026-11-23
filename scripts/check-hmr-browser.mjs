// Uses a disposable source copy: never edits the working app or its dev server.
// Start dedicated Chrome with a debugging port; see README for the invocation.
import assert from 'node:assert/strict';
import {cp,readFile,mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const fixture=await mkdtemp(join(tmpdir(),'mauritius-hmr-'));
const debug=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9239';
const port=Number(process.env.HMR_TEST_PORT||5175);
let server,tab,ws,id=0;
const pending=new Map(),errors=[],requests=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{
 const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method));},15000);
 pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));
});
const ev=async expression=>{
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;
};
const wait=async(expression,label)=>{
 for(let i=0;i<120;i++){if(await ev(expression))return;await sleep(100);}
 throw Error('Timed out: '+label);
};
try{
 await cp(join(repo,'src'),join(fixture,'src'),{recursive:true});
 for(const page of ['index.html','classic.html'])await cp(join(repo,page),join(fixture,page));
 for(const dir of ['node_modules','public'])await symlink(join(repo,dir),join(fixture,dir),'dir');
 server=await createServer({configFile:join(repo,'vite.config.js'),root:fixture,
  cacheDir:join(fixture,'.vite'),logLevel:'warn',server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[repo,fixture]}}});
 await server.listen();
 const base=server.config.base,url=`http://127.0.0.1:${port}${base}`;
 tab=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=({data})=>{
  const m=JSON.parse(data);
  if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
  if(m.method==='Network.requestWillBeSent')requests.push(new URL(m.params.request.url).pathname);
 };
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Network.setBlockedURLs',{urls:['https://*']});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  const original=fetch.bind(window);
  window.fetch=(input,options)=>{const u=new URL(input instanceof Request?input.url:input,location.href);
   return u.origin===location.origin?original(input,options):Promise.resolve(new Response(null,{status:503}));};`});
 await send('Page.navigate',{url});await wait('window.__MU_TEST__?.().region','initial scene');
 assert.equal(await ev('__MU_TEST__().roadIndexReady'),false,'Road metadata stays lazy');
 assert(!requests.some(p=>p.endsWith('/src/explorer/roads.js')||p.endsWith('/roads/index.json')),'HMR registration must not eagerly load road assets');
 await ev(`window.__hmrDocument='same-document';window.__hmrCanvas=document.querySelector('#world canvas');
  document.getElementById('place-query').value='Royal Road New Grove';document.getElementById('place-query').dispatchEvent(new Event('input'));`);
 await wait("document.querySelector('[data-result-type=road]')",'road result');
 await ev("document.querySelector('[data-result-type=road]').click()");
 await wait('__MU_TEST__().roadSelection?.ready','selected road');await sleep(1400);
 const before=await ev('({target:__MU_TEST__().target,view:__MU_TEST__().view,selection:__MU_TEST__().roadSelection.id})');
 const sameScene=async()=>{
  assert.equal(await ev("window.__hmrDocument==='same-document' && document.querySelector('#world canvas')===window.__hmrCanvas"),true,'HMR must retain the document and renderer');
  assert.equal(await ev("document.querySelectorAll('#world canvas').length"),1);
  assert.deepEqual(await ev('({target:__MU_TEST__().target,view:__MU_TEST__().view,selection:__MU_TEST__().roadSelection?.id})'),before);
 };
 const css=join(fixture,'src/explorer/style.css'),originalCSS=await readFile(css,'utf8');
 await writeFile(css,originalCSS+'\nbody{--hmr-browser-probe:live}\n');
 await wait("getComputedStyle(document.body).getPropertyValue('--hmr-browser-probe').trim()==='live'",'CSS hot update');await sameScene();
 await writeFile(css,originalCSS);
 await wait("getComputedStyle(document.body).getPropertyValue('--hmr-browser-probe').trim()===''",'CSS restore');await sameScene();
 await ev("document.getElementById('place-query').dispatchEvent(new Event('input'))");
 await wait("!document.getElementById('place-results').hidden",'open search results');
 const helper=join(fixture,'src/explorer/roads.js'),originalHelper=await readFile(helper,'utf8');
 assert(originalHelper.includes('export function searchRoads('));
 await writeFile(helper,originalHelper.replace('export function searchRoads(','function originalSearchRoads(')+
  '\nexport function searchRoads(...args){return originalSearchRoads(...args).map(road=>({...road,name:road.name+" [HMR verified]"}));}\n');
 await wait("document.querySelector('#place-results strong')?.textContent.includes('[HMR verified]')",'live road helper behavior');await sameScene();
 await writeFile(helper,originalHelper);
 await wait("document.querySelector('#place-results strong') && !document.querySelector('#place-results strong').textContent.includes('[HMR verified]')",'helper restore');await sameScene();
 // Unsafe scene-entry edits deliberately retain Vite's automatic page reload.
 const app=join(fixture,'src/explorer/app.js');await writeFile(app,(await readFile(app,'utf8'))+'\n// Main entry reload probe\n');
 await wait("!window.__hmrDocument && window.__MU_TEST__?.().region",'safe main entry reload');
 assert.equal(await ev("document.querySelectorAll('#world canvas').length"),1);
 assert.deepEqual(errors,[],'No uncaught browser exceptions');
 console.log('HMR PASS: CSS and road helper updates/restores retain document, canvas, camera and selection; scene entry safely reloads; assets remain lazy.');
}finally{
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('HMR grader closing'));}
 ws?.close();
 try{if(tab)await fetch(debug+'/json/close/'+tab.id);}finally{try{await server?.close();}finally{await rm(fixture,{recursive:true,force:true});}}
}
