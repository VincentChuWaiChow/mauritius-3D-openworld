// Terrain and overlays use the same piecewise-planar surface, not independent
// DEM samples. Clipping at triangle edges prevents roads tunnelling through hills.
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
export class TerrainSurface {
 constructor(mesh,sample,cell=100){
  this.cell=cell;this.cells=new Map();
  this.faces=mesh.triangles.map(points=>{
   const p=cross(points[0],points[1],points[2])<0?[points[0],points[2],points[1]]:points;
   return {p,h:p.map(([x,z])=>sample({x,z}))};
  }).filter(f=>cross(...f.p)>1e-9);
  for(const f of this.faces)for(const key of this.keys(f.p)){
   if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(f);
  }
 }
 *keys(p){
  const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);
  for(let x=Math.floor(Math.min(...xs)/this.cell);x<=Math.floor(Math.max(...xs)/this.cell);x++)
   for(let z=Math.floor(Math.min(...zs)/this.cell);z<=Math.floor(Math.max(...zs)/this.cell);z++)yield x+','+z;
 }
 heightOn(f,p){
  const [a,b,c]=f.p,area=cross(a,b,c);
  return (cross(b,c,p)*f.h[0]+cross(c,a,p)*f.h[1]+cross(a,b,p)*f.h[2])/area;
 }
 sceneHeight({x,z}){
  const p=[x,z];
  for(const f of this.cells.get(Math.floor(x/this.cell)+','+Math.floor(z/this.cell))??[])
   if(f.p.every((a,i)=>cross(a,f.p[(i+1)%3],p)>=-1e-7))return this.heightOn(f,p);
  return 0;
 }
 drape(points,lift,emit){
  const candidates=new Set();
  for(const key of this.keys(points))for(const f of this.cells.get(key)??[])candidates.add(f);
  for(const f of candidates){
   let poly=points;
   for(let i=0;i<3&&poly.length;i++){
    const a=f.p[i],b=f.p[(i+1)%3],out=[];
    for(let j=0;j<poly.length;j++){
     const p=poly[j],q=poly[(j+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q);
     if(dp>=-1e-9)out.push(p);
     if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    poly=out;
   }
   for(let i=1;i<poly.length-1;i++){
    const tri=[poly[0],poly[i],poly[i+1]];
    if(Math.abs(cross(...tri))<1e-10)continue;
    emit(...tri.map(p=>[p[0],this.heightOn(f,p)+lift,p[1]]));
   }
  }
 }
}
