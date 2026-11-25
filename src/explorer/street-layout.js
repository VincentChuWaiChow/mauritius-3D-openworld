import {ribbon} from './road-ribbon.js';
import {ShapeUtils,Vector2} from 'three';

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
const overlap=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
function area(polygon){
 let value=0;for(let i=1;i<polygon.length-1;i++)value+=cross(polygon[0],polygon[i],polygon[i+1]);return value/2;
}
function halfPlane(polygon,a,b,keepInside){
 const out=[];
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const previous=polygon[j],current=polygon[i],from=cross(a,b,previous),to=cross(a,b,current);
  const wasInside=keepInside?from>=0:from<=0,isInside=keepInside?to>=0:to<=0;
  if(wasInside!==isInside){
   const t=Math.max(0,Math.min(1,from/(from-to)));
   out.push({x:previous.x+(current.x-previous.x)*t,y:previous.y+(current.y-previous.y)*t,z:previous.z+(current.z-previous.z)*t});
  }
  if(isInside)out.push(current);
 }
 return out;
}
function subtractTriangle(polygon,triangle){
 const separated=(a,b)=>{
  const direction=area(a)<0?-1:1;
  return a.some((p,i)=>{
   const next=a[(i+1)%a.length];
   return Math.hypot(next.x-p.x,next.z-p.z)>1e-10&&b.every(q=>direction*cross(p,next,q)<=0);
  });
 };
 if(separated(polygon,triangle)||separated(triangle,polygon))return [polygon];
 let remainder=polygon;const outside=[];
 for(let i=0;i<3&&remainder.length>=3;i++){
  const a=triangle[i],b=triangle[(i+1)%3],part=halfPlane(remainder,a,b,false);
  if(part.length>=3&&Math.abs(area(part))>1e-10)outside.push(part);
  remainder=halfPlane(remainder,a,b,true);
 }
 return outside;
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
 touchesCircle(p,radius){
  for(const polygon of this.query(bounds([p],radius))){
   if(inside(p,polygon))return true;
   for(let i=0;i<polygon.length;i++)if(pointDistance(p,polygon[i],polygon[(i+1)%polygon.length])<=radius)return true;
  }
  return false;
 }
}
export function createStreetLayout(buildings,roads){
 const footprints=new PolygonIndex(buildings),roadFaces=[],triangulated=new Map();
 function clipRoad(vertices){
  const points=vertices.map(v=>({x:v[0],y:v[1],z:v[2]})),box=bounds(points);
  let pieces=[];
  for(let i=1;i<points.length-1;i++){
   const triangle=[points[0],points[i],points[i+1]];
   if(Math.abs(area(triangle))>1e-10)pieces.push(triangle);
  }
  for(const polygon of footprints.query(box)){
   if(!overlap(box,bounds(polygon)))continue;
   if(!triangulated.has(polygon)){
    const faces=ShapeUtils.triangulateShape(polygon.map(p=>new Vector2(p.x,p.z)),[]);
    triangulated.set(polygon,faces.map(face=>{
     const triangle=face.map(i=>polygon[i]);return area(triangle)<0?triangle.reverse():triangle;
    }).filter(triangle=>Math.abs(area(triangle))>1e-10));
   }
   for(const triangle of triangulated.get(polygon)){
    const triangleBox=bounds(triangle);
    pieces=pieces.flatMap(piece=>overlap(bounds(piece),triangleBox)?subtractTriangle(piece,triangle):[piece]);
   }
   if(!pieces.length)break;
  }
  return pieces.map(piece=>piece.map(p=>[p.x,p.y,p.z]));
 }
 // Preserve source vertices and nominal widths. Cut only the actual footprint
 // overlap, never squeeze an entire street (or its opposite edge) toward a wall.
 const fitted=roads.map(road=>({...road,style:roadStyle(road.kind),points:road.points.map(p=>({...p}))}));
 // Buildings are also excluded from planting: B union R equals B union (R minus B).
 // Nominal road triangles give identical crown exclusions without clipping twice.
 for(const road of fitted)ribbon(road.points,road.style.casing,(a,b,c,d)=>{
  for(const triangle of [[a,b,c],[a,c,d]]){
   const polygon=triangle.map(v=>({x:v[0],z:v[2]}));
   if(Math.abs(area(polygon))>1e-10)roadFaces.push(polygon);
  }
 });
 const pavement=new PolygonIndex(roadFaces);
 return {roads:fitted,clipRoad,canPlant(point,radius){
  const clearance=radius+.1; // Full crown plus a small visible gap, not just trunk.
  return !footprints.touchesCircle(point,clearance)&&!pavement.touchesCircle(point,clearance);
 }};
}
