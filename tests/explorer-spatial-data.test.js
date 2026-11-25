import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ShapeUtils,Vector2} from 'three';
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
function interiorOverlap(a,b){
 // Independent separating-axis test: shared wall boundaries have zero area.
 for(const poly of [a,b])for(let i=0;i<3;i++){
  const p=poly[i],q=poly[(i+1)%3],x=p.z-q.z,z=q.x-p.x,length=Math.hypot(x,z);
  if(!length)continue;
  const av=a.map(p=>p.x*x+p.z*z),bv=b.map(p=>p.x*x+p.z*z);
  if(Math.min(Math.max(...av),Math.max(...bv))-Math.max(Math.min(...av),Math.min(...bv))<=1e-8*length)return false;
 }
 return true;
}
function covers(p,triangles){
 return triangles.some(t=>{
  const signs=t.map((a,i)=>turn(a,t[(i+1)%3],p));
  return signs.every(s=>s>=-1e-7)||signs.every(s=>s<=1e-7);
 });
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
 const sorted=footprints.flatMap(poly=>ShapeUtils.triangulateShape(poly.map(p=>new Vector2(p.x,p.z)),[])
  .map(indices=>indices.map(i=>poly[i])).map(p=>({p,b:box(p)}))).sort((a,b)=>a.b.x-b.b.x),faces=[];
 let centrelineSamples=0;
 for(const road of layout.roads){
  const painted=[];
  ribbon(road.points,road.style.casing,(...quad)=>{
   for(const patch of layout.clipRoad(quad))for(let i=1;i<patch.length-1;i++){
    const p=[patch[0],patch[i],patch[i+1]].map(v=>({x:v[0],z:v[2]}));
    if(Math.abs(turn(...p))>1e-9){faces.push({p,b:box(p)});painted.push(p);}
   }
  });
  const roadBox=box(road.points),nearby=footprints.filter(poly=>overlap(roadBox,box(poly)));
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i];if(Math.hypot(b.x-a.x,b.z-a.z)<.001)continue;
   for(let j=0;j<=6;j++){
    const p={x:a.x+(b.x-a.x)*j/6,z:a.z+(b.z-a.z)*j/6};
    if(nearby.some(poly=>contains(p,poly)||poly.some((q,k)=>distance(p,q,poly[(k+1)%poly.length])<1e-7)))continue;
    centrelineSamples++;assert.ok(covers(p,painted),`Road ${road.id} has a gap outside all buildings`);
   }
  }
 }
 assert.ok(centrelineSamples>10_000,'Continuity is tested, not just absence of collisions');
 let collisions=0;
 for(const face of faces)for(const building of sorted){
  if(building.b.x>face.b.X)break;
  if(overlap(face.b,building.b)&&interiorOverlap(face.p,building.p))collisions++;
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
 console.log(`Port Louis spatial proof: ${buildings.length} footprints, ${faces.length} road triangles, ${centrelineSamples} covered centreline samples, ${planted.length} clear crowns`);
});
