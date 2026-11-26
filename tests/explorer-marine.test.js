import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group} from 'three';
import {project} from '../src/explorer/geo.js';
import {createMarineLayer} from '../src/explorer/marine.js';

const rectangle=(x,z,w,h)=>[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]];
const outer=rectangle(57.4,-20.3,.03,.03),hole=rectangle(57.408,-20.292,.008,.008);
const island=rectangle(57.45,-20.3,.01,.01),islandHole=rectangle(57.453,-20.297,.003,.003);
function feature(id,kind,coordinates,type='Polygon'){
 return {id,kind,name:id,center:[57.4,-20.3],bounds:[57.4,-20.3,57.5,-20.2],geometry:{type,coordinates}};
}
function fixture(){return {features:[
 feature('w1','lagoon',[outer,hole]),
 feature('r2','reef',[[island,islandHole],[rectangle(57.47,-20.3,.008,.012) ]],'MultiPolygon'),
 feature('w3','reef',[rectangle(57.5,-20.3,.01,.01).reverse()])
]};}
function deepFreeze(value){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object')deepFreeze(child);return value;}
const meshes=layer=>layer.group.children.filter(child=>child.isMesh);
const mapped=layer=>meshes(layer).filter(mesh=>!mesh.userData.marineOcean);
function area(ring){let sum=0;for(let i=1;i<ring.length;i++){const a=project(ring[i-1]),b=project(ring[i]);sum+=a.x*b.z-b.x*a.z;}return Math.abs(sum)/2;}
function triangles(mesh){const p=mesh.geometry.attributes.position.array,out=[];for(let i=0;i<p.length;i+=9)out.push([[p[i],p[i+2]],[p[i+3],p[i+5]],[p[i+6],p[i+8]]]);return out;}
function triangleArea([a,b,c]){return Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;}
function contains(triangle,p){const cross=(a,b)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);const signs=triangle.map((a,i)=>cross(a,triangle[(i+1)%3]));return !signs.some(v=>v>1e-5)||!signs.some(v=>v< -1e-5);}

test('Polygon and MultiPolygon holes survive triangulation, independently checked by area and points',()=>{
 const layer=createMarineLayer(fixture());
 const lagoon=mapped(layer).find(mesh=>mesh.userData.marineKind==='lagoon');
 const reef=mapped(layer).find(mesh=>mesh.userData.marineKind==='reef');
 const expectedLagoon=area(outer)-area(hole);
 const expectedReef=area(island)-area(islandHole)+area(rectangle(57.47,-20.3,.008,.012))+area(rectangle(57.5,-20.3,.01,.01));
 for(const [mesh,expected] of [[lagoon,expectedLagoon],[reef,expectedReef]]){
  const actual=triangles(mesh).reduce((sum,t)=>sum+triangleArea(t),0);
  assert.ok(Math.abs(actual-expected)/expected<1e-5,`${actual} vs ${expected}`);
 }
 for(const [mesh,lon,lat,covered] of [[lagoon,57.412,-20.288,false],[lagoon,57.402,-20.298,true],[reef,57.4545,-20.2955,false],[reef,57.451,-20.299,true],[reef,57.474,-20.294,true],[reef,57.505,-20.295,true]]){
  const p=project([lon,lat]);assert.equal(triangles(mesh).some(t=>contains(t,[p.x,p.z])),covered);
 }
 layer.dispose();
});

test('source rings stay immutable, coordinates stay mapped, heights use the caller terrain',()=>{
 const dataset=deepFreeze(fixture()),before=JSON.stringify(dataset),samples=[];
 const layer=createMarineLayer(dataset,{ground:p=>{samples.push(p);return 2+p.x*.001;}});
 assert.equal(JSON.stringify(dataset),before);
 assert.ok(samples.length>0);
 for(const mesh of mapped(layer)){
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-(2+p.getX(i)*.001+.09))<1e-5);
 }
 const origin=project(outer[0]),positions=mapped(layer).find(m=>m.userData.marineKind==='lagoon').geometry.attributes.position.array;
 assert.ok(Array.from({length:positions.length/3},(_,i)=>i*3).some(i=>Math.abs(positions[i]-origin.x)<.001&&Math.abs(positions[i+2]-origin.z)<.001));
 assert.notEqual(mapped(layer)[0].userData.color,mapped(layer)[1].userData.color);
 layer.dispose();
});

test('merged finite non-indexed meshes and all owned resources stay inside the advertised budgets',()=>{
 for(const software of [false,true]){
  const layer=createMarineLayer(fixture(),{software}),list=meshes(layer),stats=layer.stats();
  assert.equal(mapped(layer).length,2);assert.ok(list.length<=5);
  assert.equal(stats.meshCount,list.length);assert.equal(stats.geometryCount,list.length);assert.equal(stats.materialCount,list.length);
  assert.equal(stats.triangleCount,list.reduce((sum,m)=>sum+m.geometry.attributes.position.count/3,0));
  assert.ok(stats.triangleCount>0&&stats.triangleCount<=20000);
  for(const mesh of list){
   assert.equal(mesh.geometry.index,null);assert.match(mesh.userData.color,/^#[0-9a-f]{6}$/i);
   assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
   assert.ok(triangles(mesh).every(t=>triangleArea(t)>0));
   if(mesh.userData.marineOcean){
    assert.equal(mesh.material.depthTest,true);
    for(let i=0;i<mesh.geometry.attributes.position.count;i++)assert.ok(Math.abs(mesh.geometry.attributes.position.getY(i)+.05)<1e-7);
   }
  }
  assert.ok(list.some(m=>m.userData.marineOcean));
  layer.dispose();
 }
});

test('GPU waves change one time uniform only, keep buffers stable, and pause/resume without a jump',()=>{
 const layer=createMarineLayer(fixture()),ocean=meshes(layer).find(m=>m.material.isShaderMaterial);
 assert.ok(ocean);assert.equal(ocean.userData.marineOcean,true);
 const buffers=meshes(layer).map(m=>m.geometry.attributes.position.array),copies=buffers.map(b=>b.slice());
 const ids=layer.stats().geometryIds,bufferIds=layer.stats().bufferIds;
 assert.equal(layer.tick(0,500,true),false);
 assert.equal(layer.tick(1,500,true),true);assert.equal(layer.stats().waveTime,1);
 assert.equal(ocean.material.uniforms.uTime.value,1);
 assert.equal(layer.tick(1,500,true),false);
 assert.equal(layer.tick(2,500,false),false);
 assert.equal(layer.stats().animated,false);assert.equal(layer.stats().waveTime,1);
 assert.equal(layer.tick(100,500,true),false);assert.equal(layer.stats().waveTime,1);
 assert.equal(layer.tick(100.25,500,true),true);assert.equal(layer.stats().waveTime,1.25);
 assert.equal(layer.tick(NaN,500,true),false);
 assert.equal(layer.tick(200,1000,false),false);
 assert.deepEqual(layer.stats().geometryIds,ids);assert.deepEqual(layer.stats().bufferIds,bufferIds);
 meshes(layer).forEach((m,i)=>{assert.equal(m.geometry.attributes.position.array,buffers[i]);assert.deepEqual(buffers[i],copies[i]);assert.equal(m.geometry.attributes.position.version,0);});
 assert.match(ocean.material.fragmentShader,/#include <tonemapping_fragment>/);
 assert.match(ocean.material.fragmentShader,/#include <colorspace_fragment>/);
 assert.doesNotMatch(ocean.material.fragmentShader,/#include <(?:tonemapping|colorspace)_pars_fragment>/);
 layer.dispose();
});

test('wave toggle freezes visible crests and reanchors the absolute clock on resume',()=>{
 const layer=createMarineLayer(fixture()),count=meshes(layer).length;
 layer.tick(0,500,true);layer.tick(1,500,true);layer.setWaves(false);
 assert.equal(layer.tick(10,500,true),false);assert.equal(layer.stats().waveTime,1);
 assert.equal(layer.stats().wavesEnabled,false);assert.equal(meshes(layer).length,count);
 assert.ok(meshes(layer).every(m=>m.visible));
 layer.setWaves(true);assert.equal(layer.tick(20,500,true),false);
 assert.equal(layer.tick(21,500,true),true);assert.equal(layer.stats().waveTime,2);
 layer.dispose();
});

test('software and reduced-motion mode keep visible static water/foam without animation',()=>{
 const software=createMarineLayer(fixture(),{software:true});
 assert.ok(meshes(software).filter(m=>m.userData.marineOcean).length>=2);
 assert.ok(meshes(software).every(m=>!m.material.isShaderMaterial));
 for(const seconds of [0,1,10,100])assert.equal(software.tick(seconds,500,true),false);
 assert.equal(software.stats().waveTime,0);assert.equal(software.stats().animated,false);
 software.dispose();
 const reduced=createMarineLayer(fixture());
 for(const seconds of [0,1,10])assert.equal(reduced.tick(seconds,500,false),false);
 assert.equal(reduced.stats().waveTime,0);assert.ok(meshes(reduced).every(m=>m.visible));reduced.dispose();
});

test('dispose detaches and clears the group and releases each owned resource exactly once',()=>{
 for(const software of [false,true]){
 const layer=createMarineLayer(fixture(),{software}),parent=new Group(),counts=[];
 parent.add(layer.group);
 for(const mesh of meshes(layer))for(const resource of [mesh.geometry,mesh.material]){
  const count={n:0};resource.addEventListener('dispose',()=>count.n++);counts.push(count);
 }
 layer.dispose();layer.dispose();layer.setWaves(true);
 assert.ok(counts.every(c=>c.n===1));assert.equal(parent.children.length,0);assert.equal(layer.group.children.length,0);
 assert.equal(layer.tick(3,500,true),false);assert.equal(layer.stats().disposed,true);
 assert.equal(layer.stats().meshCount,0);assert.equal(layer.stats().geometryCount,0);assert.equal(layer.stats().materialCount,0);
 }
});

test('invalid/open polygons, invalid terrain heights and oversized data fail rather than invent geometry',()=>{
 const cases=[{features:null},{features:[feature('bad','reef',[outer.slice(0,-1)])]},
 {features:[feature('bad','reef',[])]},{features:[feature('bad','reef',[outer,rectangle(57.5,-20.2,.001,.001)])]},
 {features:[feature('bad','reef',[[[57.4,-20.3],[57.4,-20.3],[57.4,-20.3],[57.4,-20.3]]])]},
 {features:[feature('bad','reef',[rectangle(57.4,-20.3,.01,.01),[[NaN,0],[1,0],[1,1],[NaN,0]]])]},
 {features:[feature('bad','reef',[],'LineString')]},{features:[feature('bad','sand',[outer])]}];
 for(const dataset of cases)assert.throws(()=>createMarineLayer(dataset),/marine|polygon|ring|kind|geometry|features/i);
 assert.throws(()=>createMarineLayer(fixture(),{ground:()=>NaN}),/height|terrain|finite/i);
 const many={features:Array.from({length:11000},(_,i)=>feature('w'+i,'reef',[rectangle(57.4,-20.3,.01,.01)]))};
 assert.throws(()=>createMarineLayer(many),/budget|triangles|large/i);
});

test('empty and many-feature datasets keep one mesh per kind, not one resource per feature',()=>{
 const empty=createMarineLayer({features:[]});assert.equal(empty.stats().meshCount,1);assert.equal(empty.stats().triangleCount,2);empty.dispose();
 const layer=createMarineLayer({features:Array.from({length:500},(_,i)=>feature('w'+i,i%2?'reef':'lagoon',[rectangle(57.4,-20.3,.001,.001)]))});
 assert.equal(layer.stats().meshCount,3);assert.equal(layer.stats().triangleCount,1002);layer.dispose();
});

test('module owns no fetch, timer, animation loop or browser lifecycle',()=>{
 const source=readFileSync(new URL('../src/explorer/marine.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:fetch|requestAnimationFrame|setAnimationLoop|setInterval|setTimeout|addEventListener)\s*\(/);
});
