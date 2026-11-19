import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {project,unproject} from '../src/explorer/geo.js';
import {selectBuildingCluster,cameraSpan} from '../src/explorer/focus.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataset=JSON.parse(fs.readFileSync(path.join(root,'public/explorer/mauritius-osm.json'),'utf8'));

test('close-up focus is derived from real OSM building geometry, not synthetic points',()=>{
 for(const region of dataset.regions){
  const focus=selectBuildingCluster(region,project);
  assert.equal(focus.source,'osm-buildings');
  assert.ok(focus.count>=20,`${region.name}: only ${focus.count} OSM neighbors`);
  const lonLat=unproject(focus);
  assert.ok(Number.isFinite(lonLat[0])&&Number.isFinite(lonLat[1]));
  const first=selectBuildingCluster(region,project);
  assert.deepEqual(first,focus,'focus must be deterministic');
 }
});
test('camera preset magnifies buildings while district and whole-island are distinct',()=>{
 for(const region of dataset.regions){
  const close=cameraSpan(region),district=cameraSpan(region,'district'),building=cameraSpan(region,'building');
  assert.ok(close>=28&&close<=40,`${region.name}: close framing out of range ${close}`);
  assert.ok(district/close>2,`${region.name}: close view lacks magnification`);
  assert.ok(building<close,`${region.name}: picked building not enlarged`);
 }
});
test('no mapped building means camera falls back to authentic region center',()=>{
 const region={center:[57.5014,-20.1601],span:1800,buildings:[]};
 const focus=selectBuildingCluster(region,project);
 assert.equal(focus.count,0);
 assert.equal(focus.source,'region-center');
 assert.ok(Math.abs(focus.x-project(region.center).x)<1e-10);
});
test('close-up controls and building-selection action are wired into the shipped page',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'src/explorer/app.js'),'utf8');
 for(const id of ['close-view','district-view','focus-building']){
  assert.match(html,new RegExp(`id="${id}"`));
  assert.ok(js.includes(`$('${id}').onclick`),`${id} missing click behavior`);
 }
 assert.match(js,/pose\(closeFocus\(r\),false,animate,'close'\)/);
});

test('close-up shows mapped building outlines at readable screen sizes',async()=>{
 const THREE=await import('three');
 const W=1280,H=820;
 for(const region of dataset.regions){
  const focal=selectBuildingCluster(region,project),h=cameraSpan(region),aspect=W/H;
  const cam=new THREE.OrthographicCamera(-aspect*h/2,aspect*h/2,h/2,-h/2,.1,22000);
  const target=new THREE.Vector3(focal.x,0,focal.z);
  cam.position.copy(target.clone().add(new THREE.Vector3(90,170,130)));
  cam.lookAt(target);cam.updateProjectionMatrix();cam.updateMatrixWorld();
  const widths=[];
  for(const building of region.buildings){
   const pts=building.points.slice(0,-1).map(p=>{
    const v=project(p);return new THREE.Vector3(v.x,0,v.z).project(cam);
   });
   if(!pts.some(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1))continue;
   const width=(Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)))*W/2;
   widths.push(width);
  }
  assert.ok(widths.length>20,`${region.name}: ${widths.length} visible OSM buildings`);
  widths.sort((a,b)=>a-b);
  assert.ok(widths[Math.floor(widths.length/2)]>=15,
    `${region.name}: median mapped building footprint too small at ${widths[Math.floor(widths.length/2)]}px`);
 }
});
