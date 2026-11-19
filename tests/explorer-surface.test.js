import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainSurface} from '../src/explorer/surface.js';
const mesh={triangles:[[[0,0],[10,0],[0,10]],[[10,0],[10,10],[0,10]]]};
test('roads are split at terrain edges and remain above the rendered planes',()=>{
 const s=new TerrainSurface(mesh,({x,z})=>x===10&&z===10?10:0,5),out=[];
 s.drape([[2,2],[8,2],[8,8],[2,8]],.055,(...tri)=>out.push(tri));
 assert.equal(out.length,2); // The square straddles exactly two terrain triangles.
 for(const tri of out){
  const x=tri.reduce((n,v)=>n+v[0],0)/3,z=tri.reduce((n,v)=>n+v[2],0)/3,y=tri.reduce((n,v)=>n+v[1],0)/3;
  assert.ok(Math.abs(y-s.sceneHeight({x,z})-.055)<1e-8);
 }
 assert.equal(s.sceneHeight({x:9,z:9}),8);
 assert.equal(s.sceneHeight({x:1,z:1}),0);
});
test('surface handles clockwise triangles and ignores degenerate terrain',()=>{
 const s=new TerrainSurface({triangles:[[[0,10],[10,0],[0,0]],[[0,0],[0,0],[0,0]]]},()=>12);
 assert.equal(s.sceneHeight({x:1,z:1}),12);assert.equal(s.faces.length,1);
});
