import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import * as THREE from 'three';
import * as sceneryModule from '../src/explorer/scenery.js';

const source=readFileSync(new URL('../src/explorer/app.js',import.meta.url),'utf8');
function production(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,'Production function boundaries found');return source.slice(a,b);
}
function frames(){
 const camera=new THREE.OrthographicCamera(-100,100,80,-80,.1,22000),scene=new THREE.Scene();
 camera.position.set(90,170,130);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-90,340,130);
 Object.assign(sun.shadow.camera,{left:-270,right:270,top:270,bottom:-270,near:1,far:1700});
 sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
 const curve=new THREE.CurvePath();curve.add(new THREE.LineCurve3(new THREE.Vector3(),new THREE.Vector3(20,0,10)));
 const car={g:new THREE.Group(),curve,lane:.15,offset:.2,speed:.1};
 const reducedMotion={matches:false},samples=[],times=[];
 const samplePoint=curve.getPoint.bind(curve),sampleTangent=curve.getTangent.bind(curve);
 curve.getPoint=(t,target)=>{samples.push({kind:'point',target});return samplePoint(t,target);};
 curve.getTangent=(t,target)=>{samples.push({kind:'tangent',target});return sampleTangent(t,target);};
 let renders=0;
 const scope=createContext({THREE,camera,scene,sun,reducedMotion,document:{hidden:false},
  controls:{target:new THREE.Vector3(),autoRotate:false,update(){}},
  requestAnimationFrame(){},previousFrame:null,motionTime:0,lastCarTime:-Infinity,
  carPoint:new THREE.Vector3(),carTangent:new THREE.Vector3(),sunShift:new THREE.Vector3(),
  animation:null,desiredView:null,held:new Set(),groundY:()=>0,dirty:false,lastCheck:Infinity,
  groups:{traffic:{visible:true}},cars:[car],software:false,overviewMode:false,lastRender:0,
  demActive:false,surface:null,view:()=>40,updateRoadHover(){},updateRoadLocator(){},
  animateScenery:time=>times.push(time),drawWeather(){},updateLabels(){},
  renderer:{render:()=>{renders++;}},clearRoadHover(){},updateTraffic(){}});
 // New helpers are optional here so RED diagnoses original behavior, not missing names.
 if(source.includes('function animateCars('))runInContext(production('function animateCars(','function followSun('),scope);
 if(source.includes('function followSun('))runInContext(production('function followSun(','function tick('),scope);
 runInContext(production('function tick(time){','async function init()'),scope);
 const body=source.match(/document.addEventListener\('visibilitychange',\(\)=>\{([^}]+)\}\)/)?.[1];
 assert(body,'Production visibility listener found');
 return {scope,car,samples,times,get renders(){return renders;},
  frame:time=>scope.tick(time),visibility:hidden=>{scope.document.hidden=hidden;runInContext(body,scope);}};
}
function expectedCar(car,time){
 const t=(time*.001*car.speed+car.offset)%1,p=car.curve.getPoint(t),tangent=car.curve.getTangent(t);
 return {position:new THREE.Vector3(p.x+tangent.z*car.lane,.056,p.z-tangent.x*car.lane),heading:Math.atan2(tangent.x,tangent.z)};
}

test('procedural animation has a bounded foreground clock, not page-age timestamps',()=>{
 const h=frames();h.frame(10_000);h.frame(10_016);
 const expected=expectedCar(h.car,16);
 assert.ok(h.car.g.position.distanceTo(expected.position)<1e-9);
 assert.equal(h.car.g.rotation.y,expected.heading);
 h.frame(11_016);
 assert.ok(h.car.g.position.distanceTo(expectedCar(h.car,96).position)<1e-9,'Long visible stalls are capped at80ms');
 const before=h.car.g.position.clone();h.frame(11_000);
 assert.ok(h.car.g.position.equals(before),'Negative delta never reverses simulation');
});

test('equivalent foreground elapsed time produces the same car path at different frame rates',()=>{
 const a=frames(),b=frames();a.frame(0);b.frame(0);
 for(let t=16;t<=480;t+=16)a.frame(t);
 for(let t=32;t<=480;t+=32)b.frame(t);
 assert.ok(a.car.g.position.distanceTo(b.car.g.position)<1e-9);
 assert.ok(a.car.g.position.distanceTo(expectedCar(a.car,480).position)<1e-9);
});

test('visibility events pause simulation even if no animation frame ran while hidden',()=>{
 const h=frames();h.frame(0);h.frame(16);const before=h.car.g.position.clone();
 h.visibility(true);h.visibility(false);h.frame(60_000);
 assert.ok(h.car.g.position.equals(before),'Resume must not count hidden minutes');
 h.frame(60_016);assert.ok(h.car.g.position.distanceTo(expectedCar(h.car,32).position)<1e-9);
 h.visibility(true);const draws=h.renders;h.frame(100_000);
 assert.equal(h.renders,draws);
});

test('reduced motion freezes decorative simulation and avoids identical stationary renders',()=>{
 const h=frames();h.frame(0);h.frame(16);const before=h.car.g.position.clone();
 h.scope.reducedMotion.matches=true;const draws=h.renders;
 h.frame(32);h.frame(48);
 assert.ok(h.car.g.position.equals(before));assert.equal(h.renders,draws);
 assert.equal(h.times.at(-1),16);
 h.scope.reducedMotion.matches=false;h.frame(64);
 assert.ok(h.car.g.position.distanceTo(expectedCar(h.car,32).position)<1e-9);
});

test('a rebuilt scene initializes replacement cars even while simulation time is frozen',()=>{
 const h=frames(),s=h.scope;h.frame(0);h.frame(16);s.reducedMotion.matches=true;
 Object.assign(s,{root:new THREE.Group(),markers:[],buildingHits:[],cpuFaces:[],selectedBuilding:null,
  renderedStreet:{},sceneryKey:'waterfall',$:()=>({hidden:false})});
 runInContext(production('function clearWorld(){','function inPolygon('),s);s.clearWorld();
 const replacement={...h.car,g:new THREE.Group()};s.cars=[replacement];s.groups.traffic={visible:true};
 h.frame(32);
 assert.ok(replacement.g.position.distanceTo(expectedCar(replacement,16).position)<1e-9);
});

test('car curve samples reuse output vectors across cars and frames',()=>{
 const h=frames();h.frame(0);h.frame(16);
 const points=h.samples.filter(s=>s.kind==='point'&&s.target),tangents=h.samples.filter(s=>s.kind==='tangent');
 assert.equal(points.length,2);assert.equal(tangents.length,2);
 assert.ok(points.every(s=>s.target===h.scope.carPoint));
 assert.ok(tangents.every(s=>s.target===h.scope.carTangent));
});

test('free-roam shadow rig follows focus without changing its light direction or fitted extent',()=>{
 const h=frames(),s=h.scope,offset=s.sun.position.clone().sub(s.sun.target.position);
 s.controls.target.set(1000,0,-800);s.groups.traffic.visible=false;
 h.frame(0);
 assert.ok(s.sun.target.position.distanceTo(s.controls.target)<1e-9);
 assert.ok(s.sun.position.clone().sub(s.sun.target.position).distanceTo(offset)<1e-9);
 s.scene.updateMatrixWorld(true);s.sun.shadow.updateMatrices(s.sun);
 assert.ok(s.sun.shadow.getFrustum().containsPoint(s.controls.target.clone().add(new THREE.Vector3(0,10,0))));
 assert.equal(s.sun.intensity,2);assert.equal(s.sun.shadow.camera.right,270);
 const draws=h.renders;h.frame(16);assert.equal(h.renders,draws,'A stationary rig does not dirty the scene');
});

test('overview-to-street entry fits shadow depth before any focus translation',()=>{
 const h=frames(),s=h.scope;
 s.sun.position.set(-1800,6000,2700);
 Object.assign(s.sun.shadow.camera,{left:-4200,right:4200,top:4200,bottom:-4200});
 s.sun.shadow.camera.updateProjectionMatrix();s.groups.traffic.visible=false;
 const offset=s.sun.position.clone().sub(s.sun.target.position);
 h.frame(0);s.scene.updateMatrixWorld(true);s.sun.shadow.updateMatrices(s.sun);
 assert.ok(s.sun.shadow.getFrustum().containsPoint(new THREE.Vector3(0,10,0)),'Overview shadow depth reaches its focus');
 s.controls.target.set(1000,0,-800);h.frame(16);
 s.scene.updateMatrixWorld(true);s.sun.shadow.updateMatrices(s.sun);
 assert.ok(s.sun.shadow.getFrustum().containsPoint(s.controls.target.clone().add(new THREE.Vector3(0,10,0))));
 assert.ok(s.sun.position.clone().sub(s.sun.target.position).distanceTo(offset)<1e-9);
 assert.equal(s.sun.intensity,2);assert.equal(s.sun.shadow.camera.right,4200);
});

function waterfall(){
 const root=new THREE.Group(),reducedMotion={matches:false};
 const site={id:'waterfall',center:[0,0],scenery:'waterfall'};
 const scope=createContext({THREE,root,reducedMotion,matchMedia:()=>reducedMotion,software:false,dirty:false,
  groups:{},sceneryModule,sceneryLoading:null,sceneryKey:'',demActive:false,overviewMode:false,
  nearbyLandmarks:()=>[site],controls:{target:new THREE.Vector3()},view:()=>50,groundY:()=>0,
  fromGeo:()=>new THREE.Vector3(),sceneryPlacement:()=>p=>p,
  materialFor:(_,color)=>new THREE.MeshStandardMaterial({color}),collectFaces(){}});
 scope.group=name=>{const g=new THREE.Group();g.name=name;root.add(g);scope.groups[name]=g;return g;};
 scope.tri=(g,color,a,b,c)=>{
  g.userData.buckets??=new Map();if(!g.userData.buckets.has(color))g.userData.buckets.set(color,[]);
  g.userData.buckets.get(color).push(...a,...b,...c);
 };
 runInContext(production('function compile(g){','function textureFor(').split('function failedTexture(')[0],scope);
 runInContext(production('function updateScenery(){','function collectFaces(){'),scope);
 scope.updateScenery();return scope;
}

test('waterfall animation stops immediately when reduced-motion changes at runtime',()=>{
 const s=waterfall(),flow=s.groups.scenery.children.find(g=>g.name==='water-flow');
 assert.ok(flow);const attribute=flow.children[0].geometry.attributes.position;
 const before=attribute.array.slice(),version=attribute.version;
 s.reducedMotion.matches=true;s.dirty=false;s.animateScenery(1000);
 assert.deepEqual(attribute.array,before);assert.equal(attribute.version,version);assert.equal(s.dirty,false);
});

test('scenery reconciles reduced-motion changes without requiring departure and re-entry',()=>{
 const s=waterfall(),first=s.groups.scenery;let disposed=0;
 first.traverse(mesh=>mesh.geometry?.addEventListener('dispose',()=>disposed++));
 s.reducedMotion.matches=true;s.updateScenery();
 assert.ok(!s.groups.scenery.children.some(g=>g.name==='water-flow'));
 assert.ok(disposed>0,'Replaced scenery buffers are disposed');
 s.reducedMotion.matches=false;s.updateScenery();
 assert.ok(s.groups.scenery.children.some(g=>g.name==='water-flow'));
 const restored=s.groups.scenery;s.updateScenery();assert.equal(s.groups.scenery,restored);
});

test('a failed texture detaches only its current material maps and retains solid colors',()=>{
 const root=new THREE.Group(),failed=new THREE.Texture(),good=new THREE.Texture();
 const failedMat=new THREE.MeshStandardMaterial({color:'#c19a62',map:failed});
 const goodMat=new THREE.MeshStandardMaterial({color:'#aabbcc',map:good});
 const geometry=new THREE.BoxGeometry();root.add(new THREE.Mesh(geometry,failedMat),new THREE.Mesh(geometry,goodMat));
 const scope=createContext({root});
 if(source.includes('function failedTexture('))runInContext(production('function failedTexture(','function textureFor('),scope);
 else scope.failedTexture=()=>{};
 const version=failedMat.version;scope.failedTexture(failed);
 assert.equal(failedMat.map,null);assert.equal(failedMat.color.getHexString(),'c19a62');
 assert.equal(failedMat.version,version+1);assert.equal(goodMat.map,good);
 geometry.dispose();failedMat.dispose();goodMat.dispose();failed.dispose();good.dispose();
});
