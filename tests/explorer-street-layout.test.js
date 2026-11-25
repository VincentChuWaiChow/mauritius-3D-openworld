import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreetLayout,roadStyle} from '../src/explorer/street-layout.js';
import {ribbon} from '../src/explorer/road-ribbon.js';
const p=(x,z)=>({x,z,y:0});
const rect=(x0,z0,x1,z1)=>[p(x0,z0),p(x1,z0),p(x1,z1),p(x0,z1)];
const road=(points,kind='residential')=>({id:1,kind,points});
function triangles(layout){
 const faces=[];
 for(const r of layout.roads)ribbon(r.points,r.style.casing,(a,b,c,d)=>faces.push([a,b,c],[a,c,d]));
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
test('road faces fit building clearance across whole segments, not only endpoints',()=>{
 const building=rect(8,.2,12,4),input=[road([p(0,0),p(20,0)])],before=structuredClone(input);
 const layout=createStreetLayout([building],input);
 const faces=triangles(layout);assert.ok(faces.length>0);
 for(const face of faces)for(const v of face){
  // Independent rectangle distance; all vertices near its frontage stay outside.
  if(v[0]>=8&&v[0]<=12)assert.ok(v[2]<.2-1e-6);
 }
 assert.deepEqual(input,before,'Do not move or mutate source road geometry');
 assert.ok(layout.roads[0].points.some(p=>p.maxReach<.2));
});
test('centreline/building conflicts collapse only ground-road paint, not source footprints',()=>{
 const building=rect(8,-2,12,2),before=structuredClone(building);
 const layout=createStreetLayout([building],[road([p(0,0),p(20,0)])]);
 for(const face of triangles(layout)){
  const x=face.reduce((sum,v)=>sum+v[0],0)/3,z=face.reduce((sum,v)=>sum+v[2],0)/3;
  assert.ok(!(x>8&&x<12&&z>-2&&z<2));
 }
 assert.deepEqual(building,before);
 assert.ok(layout.roads[0].points.some(p=>p.maxReach===0));
});
test('duplicate nodes, zero-length ways, bends and negative coordinates remain finite and deterministic',()=>{
 const roads=[road([p(-8,-8),p(-8,-8),p(-2,-8),p(-2,-2)]),road([p(0,0),p(0,0)])];
 const buildings=[rect(-1,-7,3,-3)];
 const a=createStreetLayout(buildings,roads),b=createStreetLayout(buildings,roads);
 assert.deepEqual(a.roads,b.roads);
 for(const t of triangles(a))assert.ok(t.flat().every(Number.isFinite));
 assert.equal(a.canPlant(p(-.5,-5),1),false);
});
