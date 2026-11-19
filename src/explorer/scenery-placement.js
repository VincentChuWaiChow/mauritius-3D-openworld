// Heights are illustrative local relief, in ten-metre world units. In particular
// a mountain must not be added on top of the DEM summit a second time.
export function sceneryPlacement(site,origin,ground){
 const radius=site.radius??20,heights=[];
 if(site.placement==='relief'){
  for(let i=0;i<32;i++){
   const a=i*Math.PI/16;
   heights.push(ground({x:origin.x+Math.cos(a)*radius,z:origin.z+Math.sin(a)*radius}));
  }
 }else if(site.placement==='level'){
  // A bounded grid supports a level illustrative bowl/lake, never tilted water.
  for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++){
   if(x*x+z*z<=64)heights.push(ground({x:origin.x+x*radius/8,z:origin.z+z*radius/8}));
  }
 }
 const base=site.placement==='relief'?Math.min(...heights):site.placement==='level'?Math.max(...heights):0;
 return v=>{
  const x=origin.x+v[0],z=origin.z+v[2],terrain=ground({x,z});
  const y=site.placement==='relief'?Math.max(terrain,base+v[1]):site.placement==='level'?base+v[1]:terrain+v[1];
  return [x,y+.12,z];
 };
}

// Connect level models to the surrounding ground rather than leaving floating
// cut-out edges. Only unmatched edges at the model's base form the perimeter.
export function scenerySkirt(triangles,place,origin,ground){
 const edges=new Map(),key=p=>p.map(v=>v.toFixed(7)).join(',');
 for(const {a,b,c} of triangles)for(const [u,v] of [[a,b],[b,c],[c,a]]){
  if(Math.abs(u[1])>1e-7||Math.abs(v[1])>1e-7)continue;
  const id=[key(u),key(v)].sort().join('|');
  const edge=edges.get(id);if(edge)edge.count++;else edges.set(id,{u,v,count:1});
 }
 const out=[],toe=p=>{const x=origin.x+p[0]*1.08,z=origin.z+p[2]*1.08;return [x,ground({x,z})+.04,z];};
 for(const {u,v,count} of edges.values())if(count===1){
  const a=place(u),b=place(v),c=toe(v),d=toe(u);
  out.push({color:'#718657',a,b,c},{color:'#718657',a,b:c,c:d});
 }
 return out;
}
