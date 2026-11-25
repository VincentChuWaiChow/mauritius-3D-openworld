import test from 'node:test';
import assert from 'node:assert/strict';
import {OrthographicCamera,Vector3} from 'three';
import {sites,weatherURL,validateWeather,mountWeather} from '../src/explorer/weather.js';
const now=1_800_000_000_000;
const row=()=>({current:{time:now/1000,interval:900,temperature_2m:23,wind_direction_10m:350,wind_speed_10m:19,precipitation:0,cloud_cover:65}});
test('request and regional results preserve the same seven geographic anchors',()=>{
  const url=new URL(weatherURL());
  assert.deepEqual(url.searchParams.get('latitude').split(',').map(Number),sites.map(s=>s.lat));
  assert.equal(validateWeather(sites.map(row),now).length,7);
});
test('stale and missing samples do not create simulated weather',()=>{
  const rows=sites.map(row);
  rows[0].current.time-=3601;rows[2].current.precipitation=null;
  assert.deepEqual(validateWeather(rows,now).map(s=>s.name),sites.filter((_,i)=>i!==0&&i!==2).map(s=>s.name));
  assert.throws(()=>validateWeather([],now));
});

function weatherFixture(t) {
  const document={hidden:false},reduced={matches:false},requests=[];
  let wallTime=now;
  const patch=(name,value)=>{
    const original=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
    t.after(()=>original?Object.defineProperty(globalThis,name,original):delete globalThis[name]);
  };
  patch("document",document);
  patch("matchMedia",()=>reduced);
  t.mock.method(Date,"now",()=>wallTime);
  t.mock.method(globalThis,"fetch",(url,{signal})=>new Promise((resolve,reject)=>{
    requests.push({url,signal,fail:reject,respond:(temperature=23)=>resolve({
      ok:true,json:async()=>sites.map(()=>({current:{...row().current,temperature_2m:temperature,precipitation:1}}))
    })});
  }));
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  function mount(){
    let paints=0,particles=[];
    const ctx={
      clearRect(){paints++;particles=[];},
      save(){},beginPath(){},rect(){},clip(){},fillRect(){},stroke(){},restore(){},lineTo(){},
      createRadialGradient(x,y){particles.push([x,y]);return {addColorStop(){}};},
      moveTo(x,y){particles.push([x,y]);}
    };
    const canvas={width:300,height:150,clientWidth:800,clientHeight:600,hidden:false,getContext:()=>ctx};
    const toggle={checked:true},status={textContent:""};
    const camera=new OrthographicCamera(-3500,3500,3500,-3500,1,15000);
    camera.position.set(0,7000,3000);
    camera.lookAt(0,0,0);
    camera.updateMatrixWorld();
    const target=new Vector3(),view={wide:true,terrain:null};
    let height=0,groundCalls=0;
    const ground=()=>{groundCalls++;return height;};
    const draw=mountWeather({toggle,status,canvas});
    return {
      canvas,toggle,status,camera,target,view,
      frame(time){draw({time,camera,target,wide:view.wide,terrain:view.terrain,ground});},
      set height(value){height=value;},
      get paints(){return paints;},
      get particles(){return particles;},
      get groundCalls(){return groundCalls;}
    };
  }
  return {document,reduced,requests,flush,mount,set wallTime(value){wallTime=value;}};
}

test("weather redraws changed view inputs on the next frame, but skips a stationary frame",async t=>{
  const f=weatherFixture(t),w=f.mount();
  w.frame(0);
  f.requests[0].respond();
  await f.flush();
  w.frame(80);
  assert.ok(w.particles.length>0);
  const first=w.particles,paints=w.paints,calls=w.groundCalls;
  w.frame(96);
  assert.equal(w.paints,paints);
  assert.equal(w.groundCalls,calls);
  w.camera.position.x+=20;
  w.camera.updateMatrixWorld();
  w.frame(112);
  assert.equal(w.paints,paints+1);
  assert.notDeepEqual(w.particles,first);
  w.camera.zoom=1.1;
  w.camera.updateProjectionMatrix();
  w.frame(128);
  assert.equal(w.paints,paints+2);
  w.target.set(sites[1].x,0,sites[1].z);
  w.frame(144);
  assert.equal(w.paints,paints+3);
  assert.match(w.status.textContent,/Port Louis model/);
  w.canvas.clientWidth=900;
  w.canvas.clientHeight=650;
  w.frame(160);
  assert.equal(w.paints,paints+4);
  assert.equal(w.canvas.width,900);
  assert.equal(w.canvas.height,650);
  w.height=40;
  w.view.terrain={};
  w.frame(176);
  assert.equal(w.paints,paints+5);
  w.view.wide=false;
  w.frame(192);
  assert.equal(w.paints,paints+6);
  assert.equal(w.particles.length,148);
});

test("weather phase uses elapsed time even when camera motion causes extra redraws",async t=>{
  const f=weatherFixture(t),stable=f.mount(),moving=f.mount();
  stable.frame(0);moving.frame(0);
  f.requests.forEach(r=>r.respond());
  await f.flush();
  stable.frame(80);moving.frame(80);
  assert.ok(stable.particles.length>0);
  const start=stable.particles;
  for(const time of [96,112,128,144]){
    stable.frame(time);
    moving.camera.position.x+=20;
    moving.camera.updateMatrixWorld();
    moving.frame(time);
  }
  moving.camera.position.x=0;
  moving.camera.updateMatrixWorld();
  stable.frame(160);moving.frame(160);
  assert.ok(moving.paints>stable.paints);
  assert.deepEqual(moving.particles,stable.particles);
  assert.notDeepEqual(stable.particles,start);
  stable.frame(176);
  moving.camera.position.x+=20;
  moving.camera.updateMatrixWorld();
  moving.frame(176);
  moving.camera.position.x=0;
  moving.camera.updateMatrixWorld();
  // 140 ms since either frame, but 156 ms since the last stationary paint.
  stable.frame(316);moving.frame(316);
  assert.deepEqual(moving.particles,stable.particles);
  stable.frame(10_000);moving.frame(466);
  assert.deepEqual(moving.particles,stable.particles);
});

test("reduced motion freezes particles, but camera, visibility, and toggle still update",async t=>{
  const f=weatherFixture(t),w=f.mount();
  f.reduced.matches=true;
  w.frame(0);
  f.requests[0].respond();
  await f.flush();
  w.frame(80);
  const first=w.particles;
  assert.ok(first.length>0);
  w.camera.position.x+=20;
  w.camera.updateMatrixWorld();
  w.frame(96);
  assert.notDeepEqual(w.particles,first);
  w.camera.position.x=0;
  w.camera.updateMatrixWorld();
  w.frame(112);
  assert.deepEqual(w.particles,first);
  f.document.hidden=true;
  w.camera.position.x+=20;
  w.camera.updateMatrixWorld();
  w.frame(128);
  assert.deepEqual(w.particles,first);
  f.wallTime=now+15*60_000;
  w.frame(144);
  assert.equal(f.requests.length,1);
  f.document.hidden=false;
  w.frame(160);
  assert.notDeepEqual(w.particles,first);
  assert.equal(f.requests.length,2);
  w.toggle.checked=false;
  w.toggle.onchange();
  assert.equal(f.requests[1].signal.aborted,true);
  assert.equal(w.canvas.hidden,true);
  assert.equal(w.status.textContent,"");
  assert.equal(w.particles.length,0);
  w.toggle.checked=true;
  w.toggle.onchange();
  w.frame(176);
  assert.equal(w.canvas.hidden,false);
  assert.equal(f.requests.length,3);
  f.requests[2].respond(25);
  await f.flush();
  f.requests[1].respond(99);
  await f.flush();
  w.frame(256);
  assert.match(w.status.textContent,/25 °C/);
});

test("weather refresh remains on the 15 minute cadence, times out, and expires stale samples",async t=>{
  const f=weatherFixture(t),w=f.mount();
  t.mock.timers.enable({apis:['setTimeout']});
  w.frame(0);
  f.requests[0].respond();
  await f.flush();
  w.frame(16);
  assert.ok(w.particles.length>0);
  f.wallTime=now+15*60_000-1;
  w.frame(96);
  assert.equal(f.requests.length,1);
  f.wallTime=now+15*60_000;
  w.frame(176);
  assert.equal(f.requests.length,2);
  t.mock.timers.tick(9_999);
  assert.equal(f.requests[1].signal.aborted,false);
  t.mock.timers.tick(1);
  assert.equal(f.requests[1].signal.aborted,true);
  f.requests[1].fail(f.requests[1].signal.reason);
  await f.flush();
  f.wallTime=now+60*60_000+1;
  w.frame(256);
  assert.equal(w.particles.length,0);
  assert.doesNotMatch(w.status.textContent,/model ·/);
  f.requests[2].respond();
  await f.flush();
});
