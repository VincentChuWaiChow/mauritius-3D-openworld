import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../src/explorer/app.js',import.meta.url),'utf8');
test('production decorative tree placement consults full-canopy street clearance',()=>{
 const start=source.indexOf(' // Ornamental roadside trees:'),end=source.indexOf(' for(const b of buildingHits.filter',start);
 assert(start>=0&&end>start);
 const planted=[],checked=[];
 runInNewContext(source.slice(start,end),{
  region:{roads:[{id:1,points:[[0,0],[10,0]]}]},fromGeo:([x,z])=>({x,z}),seeded:()=>0,
  polys:[[{x:-100,z:-100},{x:100,z:-100},{x:100,z:100},{x:-100,z:100}]],inPolygon:()=>true,
  buildingHits:[{center:{x:15,z:2.5},points:[{x:5,z:-5},{x:25,z:-5},{x:25,z:10},{x:5,z:10}]}],
  roadStyle:()=>({casing:1}),streetLayout:{canPlant:(point,radius)=>{checked.push({point,radius});return false;}},
  nature:{},palm:(...args)=>planted.push(args),tree:(...args)=>planted.push(args)
 });
 assert.equal(planted.length,0,'The old centre-only check plants a palm inside this large building');
 assert.equal(checked.length,1);assert.equal(checked[0].radius,1.35);
});
