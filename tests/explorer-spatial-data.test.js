import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {project} from '../src/explorer/geo.js';
import {createStreetLayout,roadStyle} from '../src/explorer/street-layout.js';
import {ribbon} from '../src/explorer/road-ribbon.js';

const box=ps=>({x:Math.min(...ps.map(p=>p.x)),X:Math.max(...ps.map(p=>p.x)),z:Math.min(...ps.map(p=>p.z)),Z:Math.max(...ps.map(p=>p.z))});
const overlap=(a,b)=>a.x<=b.X&&a.X>=b.x&&a.z<=b.Z&&a.Z>=b.z;
const turn=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function contains(p,poly){
 let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
 }return hit;
}
function intersect(a,b,c,d){
 return overlap(box([a,b]),box([c,d]))&&turn(a,b,c)*turn(a,b,d)<=0&&turn(c,d,a)*turn(c,d,b)<=0;
}
function polygonHit(a,b){
 if(a.some(p=>contains(p,b))||b.some(p=>contains(p,a)))return true;
 return a.some((p,i)=>b.some((q,j)=>intersect(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));
}
function distance(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
test('Port Louis rendered road triangles and full decorative crowns clear all loaded building footprints',{timeout:20000},()=>{
 const roads=[],buildings=[];
 for(let x=99;x<=102;x++)for(let y=166;y<=170;y++){
  const tile=JSON.parse(readFileSync(new URL(`../public/explorer/tiles/${x}_${y}.json`,import.meta.url)));
  roads.push(...tile.roads);buildings.push(...tile.buildings);
 }
 const original=JSON.stringify({roads,buildings});
 const footprints=buildings.map(b=>b.points.slice(0,-1).map(project));
 const layout=createStreetLayout(footprints,roads.map(r=>({...r,points:r.points.map(p=>({...project(p),y:0}))})));
 const sorted=footprints.map(p=>({p,b:box(p)})).sort((a,b)=>a.b.x-b.b.x),faces=[];
 for(const road of layout.roads)ribbon(road.points,road.style.casing,(a,b,c,d)=>{
  for(const t of [[a,b,c],[a,c,d]]){
   const p=t.map(v=>({x:v[0],z:v[2]}));if(Math.abs(turn(...p))>1e-9)faces.push({p,b:box(p)});
  }
 });
 let collisions=0;
 for(const face of faces)for(const building of sorted){
  if(building.b.x>face.b.X)break;
  if(overlap(face.b,building.b)&&polygonHit(face.p,building.p))collisions++;
 }
 assert.equal(collisions,0,'No positive-area road/casing triangle may intrude into a loaded footprint');
 const source=readFileSync(new URL('../src/explorer/app.js',import.meta.url),'utf8');
 const start=source.indexOf(' // Ornamental roadside trees:'),end=source.indexOf(' for(const b of buildingHits.filter',start);
 const data=JSON.parse(readFileSync(new URL('../public/explorer/mauritius-osm.json',import.meta.url)));
 const planted=[],capture=(kind,_g,x,z,size)=>planted.push({x,z,radius:(kind==='palm'?1.5:.85)*size});
 const scope={region:{roads},streetLayout:layout,roadStyle,fromGeo:project,
  seeded:n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);},
  polys:data.land.map(r=>r.slice(0,-1).map(project)),inPolygon:contains,nature:{},
  palm:(...args)=>capture('palm',...args),tree:(...args)=>capture('tree',...args)};
 runInNewContext(source.slice(start,end),scope);
 assert.ok(planted.length>0,'Do not solve collisions by silently removing every decorative tree');
 assert.ok(planted.length<=180);
 for(const tree of planted)for(const poly of [...footprints,...faces.map(f=>f.p)]){
  assert.ok(!contains(tree,poly));
  for(let i=0;i<poly.length;i++)assert.ok(distance(tree,poly[i],poly[(i+1)%poly.length])>tree.radius+.09999);
 }
 assert.equal(JSON.stringify({roads,buildings}),original,'Source road/building geometry is unchanged');
 console.log(`Port Louis spatial proof: ${buildings.length} footprints, ${faces.length} road triangles, ${planted.length} clear decorative crowns`);
});
