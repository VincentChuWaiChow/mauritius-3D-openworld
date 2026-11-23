import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainSurface} from '../src/explorer/surface.js';
import {OrthographicCamera,Vector3} from 'three';
import {pickRoad} from '../src/explorer/roads.js';
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
test('road hit proxy follows exact terrain facets over a ridge, not the endpoint chord',()=>{
 const triangles=[];
 for(const x of [0,10])triangles.push([[x,0],[x+10,0],[x,10]],[[x+10,0],[x+10,10],[x,10]]);
 const s=new TerrainSurface({triangles},({x})=>x===10?8:0,5),line=[[2,5],[18,5]];
 const pieces=s.trace(line,.06);
 assert(pieces.length>=2);
 assert(pieces.flat().some(p=>Math.abs(p[0]-10)<1e-8&&Math.abs(p[1]-8.06)<1e-8));
 for(const [a,b] of pieces){
  const p={x:(a[0]+b[0])/2,z:(a[2]+b[2])/2};
  assert.ok(Math.abs((a[1]+b[1])/2-s.sceneHeight(p)-.06)<1e-8);
 }
 const camera=new OrthographicCamera(-12,12,10,-10,.1,100);
 camera.position.set(10,20,25);camera.lookAt(10,0,5);camera.updateMatrixWorld();
 const screen=p=>{const v=new Vector3(...p).project(camera);return {x:(v.x+1)*400,y:(1-v.y)*400};};
 const ridge=screen([10,8.06,5]);
 assert.equal(pickRoad([{wayId:1,points:line.map(([x,z])=>screen([x,s.sceneHeight({x,z})+.06,z]))}],ridge),null,'Old chord misses the visible ridge');
 assert.equal(pickRoad(pieces.map(p=>({wayId:1,points:p.map(screen)})),ridge).wayId,1);
});
test('terrain traces clip outside areas, preserve gaps and ignore zero-length segments',()=>{
 const s=new TerrainSurface({triangles:[[[0,0],[2,0],[0,2]],[[4,0],[6,0],[4,2]]]},()=>3,2);
 const line=[[-1,.5],[-1,.5],[7,.5]],before=structuredClone(line),out=s.trace(line,.06);
 assert.equal(out.length,2);
 for(const segment of out){
  assert(segment.every(p=>Math.abs(p[1]-3.06)<1e-8));
  assert(segment.every(p=>p[0]<=1.5+1e-8)||segment.every(p=>p[0]>=4-1e-8),'Never bridge unmapped terrain');
 }
 assert.deepEqual(line,before);assert.deepEqual(s.trace([[8,8],[10,10]]),[]);
});
