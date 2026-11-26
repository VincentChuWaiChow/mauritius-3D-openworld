import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createStreetLayout,roadStyle} from '../src/explorer/street-layout.js';

const source=readFileSync(new URL('../src/explorer/app.js',import.meta.url),'utf8');
function production(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,'Production function boundaries found');
 return source.slice(a,b);
}
const emptyRegion={id:'port-louis',roads:[],buildings:[],parks:[]};
function streaming(){
 const reads=[],builds=[],root=new THREE.Group(),nodes=new Map();
 let keys=['A','B','C'],height=40,load=async ks=>ks.map(()=>({roads:[],buildings:[]}));
 const scope=createContext({THREE,createStreetLayout,roadStyle,AbortController,Set,performance,root,markers:[],cars:[],buildingHits:[],cpuFaces:[],
  groups:{},selectedBuilding:null,renderedStreet:null,sceneryKey:'',current:emptyRegion,overviewMode:false,
  roamingRegion:null,streetRequest:null,roamKey:'',roamGeneration:0,demActive:false,demToken:0,surface:null,
  tileIndex:new Set(keys),terrainMeshes:null,roadTapVersion:0,roadPickPaths:[],selectedRoad:null,trafficLines:[],
  data:{land:[],regions:[],mainRoads:[]},colors:{},marineControls:null,themeId:'little',software:false,dirty:false,lastCheck:0,
  controls:{target:new THREE.Vector3()},view:()=>height,viewportKeys:()=>keys,unproject:()=>[57.5,-20.16],
  clearRoadHover(){},compile(){},freeLabel(){},setTerrainStatus(){},requestElevation(){},
  document:{querySelectorAll:()=>[]},
  $:id=>{if(!nodes.has(id))nodes.set(id,{checked:true,hidden:true});return nodes.get(id);},
  tileStore:{read:(ks,signal)=>{reads.push({keys:[...ks],signal});return load(ks,signal);}}
 });
 scope.group=name=>{const g=new THREE.Group();g.name=name;root.add(g);scope.groups[name]=g;return g;};
 runInContext(production('function clearWorld(){','function inPolygon('),scope);
 runInContext(production('function buildWorld(','// Geometry is imported'),scope);
 const build=scope.buildWorld;
 scope.buildWorld=(region,overview=false)=>{builds.push({region,overview});build(region,overview);};
 runInContext(production('async function trackDetail(){','let searchLocation='),scope);
 return {scope,reads,builds,track:()=>scope.trackDetail(),
  set keys(v){keys=v;},set view(v){height=v;},set load(v){load=v;}};
}

test('covered street subsets reuse actual meshes without accumulating tile coverage',{timeout:2000},async()=>{
 const h=streaming();await h.track();
 const meshRoot=h.scope.groups.buildings,region=h.scope.renderedStreet;
 h.keys=['B'];await h.track();await h.track();
 assert.equal(h.reads.length,1);assert.equal(h.builds.length,1);
 assert.equal(h.scope.groups.buildings,meshRoot);assert.equal(h.scope.renderedStreet,region);
 h.keys=['B','D'];await h.track();
 assert.equal(h.reads.length,2);assert.equal(h.builds.length,2);
 assert.deepEqual([...h.scope.renderedStreet.tileKeys],['B','D']);
 assert.notEqual(h.scope.groups.buildings,meshRoot);
 h.keys=['A'];await h.track();
 assert.equal(h.builds.length,3,'No union of previously visited footprints');
});

test('LOD changes rebuild, while completed terrain/style rebuilds retain their coverage',{timeout:2000},async()=>{
 const h=streaming();await h.track();
 h.view=100;await h.track();
 assert.equal(h.builds.length,2);assert.equal(h.scope.renderedStreet.simple,true);
 h.scope.demActive=true;h.scope.buildWorld(h.scope.roamingRegion);
 const rebuilt=h.scope.groups.buildings;
 h.keys=['B'];await h.track();
 assert.equal(h.builds.length,3);assert.equal(h.scope.groups.buildings,rebuilt);
 assert.equal(h.scope.demActive,true,'Reuse does not reset newly applied terrain');
 h.scope.clearWorld();await h.track();
 assert.equal(h.builds.length,4,'A cleared scene must not reuse stale keys');
 h.view=40;await h.track();assert.equal(h.builds.length,5);
});

test('return to rendered coverage cancels pending expansion even if its loader ignores abort',{timeout:2000},async()=>{
 const h=streaming();await h.track();
 let resolve;
 h.load=()=>new Promise(r=>{resolve=r;});h.keys=['A','B','D'];
 const pending=h.track(),request=h.scope.streetRequest;
 await h.track();assert.equal(h.reads.length,2,'Identical pending request is shared');
 h.keys=['B'];await h.track();
 assert.equal(request.signal.aborted,true);assert.equal(h.scope.streetRequest,null);
 resolve([{roads:[],buildings:[]}]);await pending;
 assert.equal(h.builds.length,1);assert.deepEqual([...h.scope.renderedStreet.tileKeys],['A','B','C']);
});

test('newest uncovered request wins and an older finally cannot clear its controller',{timeout:2000},async()=>{
 const h=streaming();await h.track();
 const ready=[];h.load=()=>new Promise(r=>ready.push(r));
 h.keys=['D'];const older=h.track();
 h.keys=['E'];const newer=h.track(),request=h.scope.streetRequest;
 ready[0]([{roads:[],buildings:[]}]);await older;
 assert.equal(h.scope.streetRequest,request);
 ready[1]([{roads:[],buildings:[]}]);await newer;
 assert.deepEqual([...h.scope.renderedStreet.tileKeys],['E']);assert.equal(h.builds.length,2);
});

test('horizon fallback discards coverage and cannot be overwritten by an aborted load',{timeout:2000},async()=>{
 const h=streaming();await h.track();let resolve;
 h.load=()=>new Promise(r=>{resolve=r;});h.keys=['D'];const pending=h.track();
 h.keys=null;await h.track();
 assert.equal(h.scope.overviewMode,true);assert.equal(h.scope.renderedStreet,null);
 resolve([{roads:[],buildings:[]}]);await pending;
 assert.equal(h.scope.overviewMode,true);assert.equal(h.builds.length,2);
});

test('failed street load clears pending identity and can be retried for the same keys',{timeout:2000},async()=>{
 const h=streaming();h.load=async()=>{throw Error('offline');};await h.track();
 assert.equal(h.scope.streetRequest,null);assert.equal(h.scope.roamKey,'');
 h.load=async ks=>ks.map(()=>({roads:[],buildings:[]}));await h.track();
 assert.equal(h.reads.length,2);assert.equal(h.builds.length,1);
});

test('tick refreshes camera matrices before every screen-space consumer without hover/detail side effects',()=>{
 const camera=new THREE.OrthographicCamera(-100,100,80,-80,.1,22000);
 camera.position.set(90,170,130);
 const controls=new OrbitControls(camera,null);controls.autoRotate=true;controls.autoRotateSpeed=40;
 controls.update(0);camera.updateMatrixWorld();
 const observed=[];
 const check=name=>{
  const independent=camera.clone();independent.updateMatrixWorld();
  const point=new THREE.Vector3(45,4,-30),actual=point.clone().project(camera),expected=point.project(independent);
  assert.ok(actual.distanceTo(expected)*1440<1e-6,name+' uses current matrices');observed.push(name);
 };
 const scope=createContext({camera,controls,requestAnimationFrame(){},document:{hidden:false},previousFrame:0,
  motionTime:0,reducedMotion:{matches:false},marineControls:null,followSun(){},animateCars(){},
  animation:null,desiredView:null,held:new Set(),groundY:()=>0,dirty:true,lastCheck:Infinity,
  groups:{},scene:new THREE.Scene(),software:false,overviewMode:false,lastRender:0,demActive:false,surface:null,view:()=>40,
  updateRoadHover:()=>check('hover'),updateRoadLocator:()=>check('locator'),
  animateScenery(){},drawWeather:()=>check('weather'),renderer:{render:()=>check('render')},updateLabels(){}});
 runInContext(production('function tick(time){','async function init()'),scope);
 for(const time of [16,32,48])scope.tick(time);
 assert.deepEqual(observed,['hover','locator','weather','render','hover','locator','weather','render','hover','locator','weather','render']);
 camera.zoom=1.4;camera.updateProjectionMatrix();camera.position.x+=20;controls.target.x+=20;
 scope.tick(64);assert.equal(observed.length,16);
 // Null DOM controls never connected listeners (dispose requires a DOM element).
});
