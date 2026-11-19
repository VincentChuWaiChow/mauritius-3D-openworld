import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryPlacement,scenerySkirt} from '../src/explorer/scenery-placement.js';
test('mountain relief uses foothills, not summit plus model height',()=>{
 const ground=({x,z})=>5+Math.max(0,40-Math.hypot(x,z));
 const place=sceneryPlacement({placement:'relief',radius:75},{x:0,z:0},ground);
 assert.equal(place([0,52,0])[1],57.12);
 assert.equal(place([0,1,0])[1],45.12,'never below DEM');
});
test('level lake water remains horizontal on sloped DEM and flat fallback',()=>{
 for(const ground of [()=>0,({x,z})=>x*.2+z*.1]){
  const place=sceneryPlacement({placement:'level',radius:28},{x:0,z:0},ground);
  assert.equal(place([-15,.3,0])[1],place([15,.3,0])[1]);
  assert(place([0,.3,0])[1]>ground({x:0,z:0}));
 }
});
test('existing Chamarel placement remains draped',()=>{
 const place=sceneryPlacement({},{x:10,z:20},({x})=>x);
 assert.deepEqual(place([1,2,3]),[11,13.12,23]);
});
test('level foundations close only perimeter edges, not shared interior edges',()=>{
 const triangles=[{a:[-1,0,-1],b:[1,0,-1],c:[1,0,1]},{a:[-1,0,-1],b:[1,0,1],c:[-1,0,1]}];
 const ground=()=>2,origin={x:0,z:0};
 const skirt=scenerySkirt(triangles,p=>[p[0],5,p[2]],origin,ground);
 assert.equal(skirt.length,8);
 assert(skirt.every(f=>[f.a,f.b,f.c].some(p=>p[1]===2.04)));
 assert(skirt.every(f=>[f.a,f.b,f.c].some(p=>p[1]===5)));
});
