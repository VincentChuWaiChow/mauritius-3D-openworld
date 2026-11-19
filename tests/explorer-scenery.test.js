import test from 'node:test';
import assert from 'node:assert/strict';
import {EARTH_COLORS,sceneryTriangles,waterTriangles} from '../src/explorer/scenery.js';

function validate(triangles,radius=20,height=13){
 assert.ok(triangles.length>0&&triangles.length<6000);
 for(const {color,a,b,c} of triangles){
  assert.match(color,/^#[0-9a-f]{6}$/i);
  for(const p of [a,b,c]){
   assert.equal(p.length,3);assert.ok(p.every(Number.isFinite));
   assert.ok(Math.hypot(p[0],p[2])<radius);assert.ok(p[1]>=0&&p[1]<height);
  }
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-9);
 }
}
test('both local landmark meshes are deterministic, finite, nondegenerate and bounded',()=>{
 for(const kind of ['dunes','waterfall']){
  const mesh=sceneryTriangles(kind);validate(mesh);assert.deepEqual(mesh,sceneryTriangles(kind));
 }
 assert.throws(()=>sceneryTriangles('unknown'),RangeError);
});
test('additional scenery is deterministic and stays inside per-kind geometry budgets',()=>{
 for(const [kind,radius,height] of [['mountain',90,56],['crater',24,10],['lake',28,8]]){
  const mesh=sceneryTriangles(kind);validate(mesh,radius,height);assert.deepEqual(mesh,sceneryTriangles(kind));
 }
});
test('mountain has broad asymmetric elevated crown and steep basalt flanks, not a cone',()=>{
 const mesh=sceneryTriangles('mountain'),points=mesh.flatMap(t=>[t.a,t.b,t.c]);
 const summit=points.filter(p=>p[1]>40);
 assert.ok(summit.length>100);
 assert.ok(Math.max(...summit.map(p=>p[0]))-Math.min(...summit.map(p=>p[0]))>35);
 const maxHeight=Math.max(...points.map(p=>p[1]));
 assert.ok(maxHeight>48&&maxHeight<56);
 assert.ok(points.some(p=>p[1]===maxHeight&&Math.abs(p[0])>1));
 const rock=new Set(['#777766','#8a8673','#6c7365','#9b937d']);
 assert.ok(mesh.some(t=>rock.has(t.color)&&Math.max(t.a[1],t.b[1],t.c[1])-Math.min(t.a[1],t.b[1],t.c[1])>20));
});
test('crater has a low central depression surrounded by a raised wooded rim',()=>{
 const mesh=sceneryTriangles('crater'),points=mesh.flatMap(t=>[t.a,t.b,t.c]);
 const centre=points.filter(p=>Math.hypot(p[0],p[2])<2);
 assert.ok(centre.length>0&&centre.every(p=>p[1]<.5));
 assert.ok(points.filter(p=>p[1]>6&&Math.hypot(p[0],p[2])>12).length>100);
 assert.ok(mesh.some(t=>t.color==='#356647'));
});
test('lake includes level calm water, wooded banks and decorative access steps',()=>{
 const mesh=sceneryTriangles('lake'),water=mesh.filter(t=>['#52908c','#579591'].includes(t.color));
 assert.equal(water.length,64);
 assert.ok(water.every(t=>[t.a,t.b,t.c].every(p=>p[1]===.2)));
 assert.ok(mesh.some(t=>t.color==='#c5bda5'));assert.ok(mesh.some(t=>t.color==='#a76d52'));
});
test('dunes contain seven earth bands and elevated rolling relief',()=>{
 const mesh=sceneryTriangles('dunes'),earth=mesh.filter(t=>EARTH_COLORS.includes(t.color));
 assert.equal(new Set(earth.map(t=>t.color)).size,7);
 const heights=earth.flatMap(t=>[t.a[1],t.b[1],t.c[1]]);
 assert.ok(Math.max(...heights)>.8);assert.ok(Math.min(...heights)<.1);
});
test('waterfall has tall rock faces, basin, sheet and animated fixed-size highlights',()=>{
 const mesh=sceneryTriangles('waterfall');
 assert.ok(mesh.some(t=>t.a[1]>9&&t.b[1]<9));
 assert.ok(mesh.some(t=>t.color==='#508e8d'));assert.ok(mesh.some(t=>t.color==='#d8eee5'));
 for(const time of [0,.5,1,100,-1,NaN]){const flow=waterTriangles(time);validate(flow);assert.equal(flow.length,32);}
 assert.notDeepEqual(waterTriangles(0),waterTriangles(.5));
});
