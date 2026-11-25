import {ribbon} from './road-ribbon.js';

// Illustrated widths, in 10-metre scene units; not surveyed carriageway widths.
export function roadStyle(kind){
 const name=(kind||'road').replace(/_link$/,'');
 const width=({motorway:1.6,trunk:1.35,primary:1.2,secondary:1,tertiary:.85,
  residential:.65,unclassified:.6,living_street:.4,service:.45,pedestrian:.35,
  track:.3,footway:.18,cycleway:.25,path:.18,steps:.18})[name]??.6;
 const walking=['pedestrian','footway','cycleway','path','steps'].includes(name);
 return {width,casing:width+(walking?.08:.35)};
}
function pointDistance(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)):0;
 return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function segmentDistance(a,b,c,d){
 const ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);
 if(((ac>0&&ad<0)||(ac<0&&ad>0))&&((ca>0&&cb<0)||(ca<0&&cb>0)))return 0;
 return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
function inside(p,polygon){
 let hit=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
 }
 return hit;
}
function bounds(points,pad=0){
 let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
 for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
 return {minX:minX-pad,maxX:maxX+pad,minZ:minZ-pad,maxZ:maxZ+pad};
}
// Built once per bounded street scene, not during the animation loop.
class PolygonIndex{
 constructor(polygons){
  this.cells=new Map();
  for(const polygon of polygons){
   if(polygon.length<3)continue;
   const box=bounds(polygon);
   this.visit(box,key=>{if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(polygon);});
  }
 }
 visit(box,fn){
  for(let x=Math.floor(box.minX/8);x<=Math.floor(box.maxX/8);x++)
   for(let z=Math.floor(box.minZ/8);z<=Math.floor(box.maxZ/8);z++)fn(x+','+z);
 }
 query(box){
  const found=new Set();this.visit(box,key=>{for(const poly of this.cells.get(key)||[])found.add(poly);});return found;
 }
 segmentClearance(a,b,radius){
  let distance=Infinity;
  for(const polygon of this.query(bounds([a,b],radius))){
   if(inside(a,polygon)||inside(b,polygon))return 0;
   for(let i=0;i<polygon.length;i++)distance=Math.min(distance,segmentDistance(a,b,polygon[i],polygon[(i+1)%polygon.length]));
   if(distance===0)return 0;
  }
  return distance;
 }
 touchesCircle(p,radius){
  for(const polygon of this.query(bounds([p],radius))){
   if(inside(p,polygon))return true;
   for(let i=0;i<polygon.length;i++)if(pointDistance(p,polygon[i],polygon[(i+1)%polygon.length])<=radius)return true;
  }
  return false;
 }
}
export function createStreetLayout(buildings,roads){
 const footprints=new PolygonIndex(buildings),roadFaces=[];
 const fitted=roads.map(road=>{
  const style=roadStyle(road.kind),points=[];
  for(const p of road.points){
   const a=points.at(-1);
   if(!a){points.push({...p,maxReach:Infinity});continue;}
   const length=Math.hypot(p.x-a.x,p.z-a.z);
   if(length<.001)continue;
   const steps=Math.max(1,Math.ceil(length/2));
   for(let i=1;i<=steps;i++)points.push({x:a.x+(p.x-a.x)*i/steps,z:a.z+(p.z-a.z)*i/steps,y:p.y??0,maxReach:Infinity});
  }
  for(let i=1;i<points.length;i++){
   // Both endpoints stay inside the cleared capsule of the ENTIRE segment.
   // This also bounds miters; testing only vertex distances misses mid-block walls.
   const reach=Math.max(0,footprints.segmentClearance(points[i-1],points[i],style.casing)-.02);
   points[i-1].maxReach=Math.min(points[i-1].maxReach,reach);
   points[i].maxReach=Math.min(points[i].maxReach,reach);
  }
  ribbon(points,style.casing,(a,b,c,d)=>{
   for(const tri of [[a,b,c],[a,c,d]]){
    const polygon=tri.map(v=>({x:v[0],z:v[2]}));
    if(Math.abs(cross(...polygon))>1e-10)roadFaces.push(polygon);
   }
  });
  return {...road,style,points};
 });
 const pavement=new PolygonIndex(roadFaces);
 return {roads:fitted,canPlant(point,radius){
  const clearance=radius+.1; // Full crown plus a small visible gap, not just trunk.
  return !footprints.touchesCircle(point,clearance)&&!pavement.touchesCircle(point,clearance);
 }};
}
