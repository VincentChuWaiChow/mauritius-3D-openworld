import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreetLayout,roadStyle} from '../src/explorer/street-layout.js';
import {ribbon} from '../src/explorer/road-ribbon.js';
const p=(x,z)=>({x,z,y:0});
const rect=(x0,z0,x1,z1)=>[p(x0,z0),p(x1,z0),p(x1,z1),p(x0,z1)];
const road=(points,kind='residential')=>({id:1,kind,points});
function triangles(layout){
 const faces=[];
 for(const r of layout.roads)ribbon(r.points,r.style.casing,(a,b,c,d)=>{
  for(const patch of layout.clipRoad?layout.clipRoad([a,b,c,d]):[[a,b,c,d]])
   for(let i=1;i<patch.length-1;i++)faces.push([patch[0],patch[i],patch[i+1]]);
 });
 return faces.filter(t=>Math.abs((t[1][0]-t[0][0])*(t[2][2]-t[0][2])-(t[2][0]-t[0][0])*(t[1][2]-t[0][2]))>1e-10);
}
test('pedestrian ways are not assigned car-road widths and links preserve their parent style',()=>{
 for(const kind of ['footway','path','steps','cycleway'])assert.ok(roadStyle(kind).width<roadStyle('residential').width/2);
 assert.deepEqual(roadStyle('primary_link'),roadStyle('primary'));
 assert.ok(roadStyle('footway').casing<.4);
});
test('canopies clear whole large and concave footprints, including touching edges',()=>{
 const layout=createStreetLayout([rect(0,0,20,10)],[]);
 assert.equal(layout.canPlant(p(1,1),.7),false,'Far from centroid but inside footprint');
 assert.equal(layout.canPlant(p(-.5,4),.8),false,'Trunk outside, crown intersects wall');
 assert.equal(layout.canPlant(p(-1,4),1),false,'Touching is not safe clearance');
 assert.equal(layout.canPlant(p(-1.2,4),1),true);
 const concave=[p(0,0),p(4,0),p(4,1),p(1,1),p(1,4),p(0,4)];
 assert.equal(createStreetLayout([concave],[]).canPlant(p(2,2),.3),true,'AABB is not the building polygon');
});
test('planting checks every drawn road, including a crossing street rather than only the candidate source',()=>{
 const layout=createStreetLayout([],[road([p(0,0),p(10,0)]),road([p(8,-10),p(8,10)])]);
 assert.equal(layout.canPlant(p(8,1.3),.7),false);
 assert.equal(layout.canPlant(p(5,.8),.7),false,'Crown reaches casing');
 assert.equal(layout.canPlant(p(5,2),.7),true);
});
test('road paint clips only the overlapping side, retaining the opposite edge and source vertices',()=>{
 const building=rect(8,.2,12,4),input=[road([p(0,0),p(20,0)])],before=structuredClone(input);
 const layout=createStreetLayout([building],input);
 const faces=triangles(layout);assert.ok(faces.length>0);
 for(const face of faces)for(const v of face){
  // Independent rectangle distance; all vertices near its frontage stay outside.
  if(v[0]>8&&v[0]<12)assert.ok(v[2]<=.2+1e-8);
 }
 assert.deepEqual(input,before,'Do not move or mutate source road geometry');
 assert.deepEqual(layout.roads[0].points,input[0].points,'No subdivision or nearest-building width hints');
 assert.ok(faces.some(t=>t.some(v=>v[2]<-.49)),'Opposite road edge remains full width');
});
test('centreline/building conflicts clip only ground-road paint, not source footprints',()=>{
 const building=rect(8,-2,12,2),before=structuredClone(building);
 const layout=createStreetLayout([building],[road([p(0,0),p(20,0)])]);
 for(const face of triangles(layout)){
  const x=face.reduce((sum,v)=>sum+v[0],0)/3,z=face.reduce((sum,v)=>sum+v[2],0)/3;
  assert.ok(!(x>8&&x<12&&z>-2&&z<2));
 }
 assert.deepEqual(building,before);
 assert.deepEqual(layout.roads[0].points,[p(0,0),p(20,0)]);
});

const area=patches=>patches.reduce((sum,poly)=>sum+Math.abs(poly.reduce((n,a,i)=>{const b=poly[(i+1)%poly.length];return n+a[0]*b[2]-b[0]*a[2];},0))/2,0);
function covered(point,faces){
 return faces.some(t=>{
  const s=t.map((a,i)=>{const b=t[(i+1)%3];return (b[0]-a[0])*(point.z-a[2])-(b[2]-a[2])*(point.x-a[0]);});
  return s.every(v=>v>=-1e-8)||s.every(v=>v<=1e-8);
 });
}
test('a wall almost touching one side cannot erase an unobstructed centreline or pinch the far side',()=>{
 const layout=createStreetLayout([rect(8,.01,12,4)],[road([p(0,0),p(20,0)])]);
 const faces=triangles(layout);
 for(let x=.1;x<20;x+=.1)assert.ok(covered(p(x,0),faces),'Unobstructed centreline at'+x);
 for(let x=.1;x<20;x+=.1)assert.ok(covered(p(x,-.49),faces),'Far edge width at'+x);
 for(const x of [2,6,14,18])assert.ok(covered(p(x,.49),faces),'Full width away from footprint at'+x);
});
test('footprint subtraction preserves exact area for partial, enclosed, containing and touching obstacles',()=>{
 const quad=[[0,7,0],[4,7,0],[4,7,4],[0,7,4]];
 for(const [buildings,expected] of [
  [[],16],[[rect(2,2,6,6)],12],[[rect(1,1,3,3)],12],[[rect(-1,-1,5,5)],0],
  [[rect(4,0,6,4)],16],[[rect(2,2,6,6).reverse()],12],
  [[rect(1,1,3,3),rect(2,2,4,4)],9]
 ]){
  const layout=createStreetLayout(buildings,[]),original=structuredClone(quad),patches=layout.clipRoad(quad);
  assert.ok(Math.abs(area(patches)-expected)<1e-7,`${expected}square scene units remain`);
  assert.deepEqual(quad,original);
  assert.ok(patches.flat().every(v=>v[1]===7));
 }
});
test('concave footprints clip without filling their open notch and interpolate road heights',()=>{
 const building=[p(0,0),p(3,0),p(3,1),p(1,1),p(1,3),p(0,3)];
 const layout=createStreetLayout([building],[]),patches=layout.clipRoad([[0,0,0],[4,4,0],[4,12,4],[0,8,4]]);
 assert.ok(Math.abs(area(patches)-11)<1e-7);
 for(const v of patches.flat())assert.ok(Math.abs(v[1]-v[0]-2*v[2])<1e-8);
 const faces=patches.flatMap(poly=>poly.slice(1,-1).map((v,i)=>[poly[0],v,poly[i+2]]));
 assert.ok(covered(p(2,2),faces),'The concave notch is not treated as building area');
});
test('rectangle subtraction matches independent analytic intersection area across deterministic fixtures',()=>{
 const quad=[[0,0,0],[4,0,0],[4,0,4],[0,0,4]];
 let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<300;i++){
  const x=random()*8-2,z=random()*8-2,w=random()*4+.01,h=random()*4+.01;
  const obstacle=rect(x,z,x+w,z+h);if(i%2)obstacle.reverse();if(i%3===0)obstacle.push(obstacle[0]);
  const expected=16-Math.max(0,Math.min(4,x+w)-Math.max(0,x))*Math.max(0,Math.min(4,z+h)-Math.max(0,z));
  assert.ok(Math.abs(area(createStreetLayout([obstacle],[]).clipRoad(quad))-expected)<1e-7,'Analytic area fixture'+i);
 }
});
test('duplicate nodes, zero-length ways, bends and negative coordinates remain finite and deterministic',()=>{
 const roads=[road([p(-8,-8),p(-8,-8),p(-2,-8),p(-2,-2)]),road([p(0,0),p(0,0)])];
 const buildings=[rect(-1,-7,3,-3)];
 const a=createStreetLayout(buildings,roads),b=createStreetLayout(buildings,roads);
 assert.deepEqual(a.roads,b.roads);
 for(const t of triangles(a))assert.ok(t.flat().every(Number.isFinite));
 assert.equal(a.canPlant(p(-.5,-5),1),false);
});
