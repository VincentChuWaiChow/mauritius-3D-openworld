// Shared edges avoid pinholes between independently rotated road segments.
export function ribbon(points, width, emit) {
  const pts = [];
  for (const p of points) {
    const prev = pts.at(-1);
    if (!prev || Math.hypot(p.x-prev.x, p.z-prev.z) >= .001) pts.push(p);
  }
  if (pts.length < 2) return;
  const normals = pts.slice(1).map((p,i) => {
    const dx=p.x-pts[i].x, dz=p.z-pts[i].z, length=Math.hypot(dx,dz);
    return {x:-dz/length,z:dx/length};
  });
  const closed=Math.hypot(pts[0].x-pts.at(-1).x,pts[0].z-pts.at(-1).z)<.001;
  const pairs=pts.map((p,i)=>{
    const a=normals[i-1] ?? (closed ? normals.at(-1) : normals[0]);
    const b=normals[i] ?? (closed ? normals[0] : normals.at(-1));
    const mx=a.x+b.x, mz=a.z+b.z, length=Math.hypot(mx,mz);
    const nx=length>.001?mx/length:b.x, nz=length>.001?mz/length:b.z;
    const reach=width*.5/Math.max(.5,nx*b.x+nz*b.z);
    return [[p.x+nx*reach,p.y,p.z+nz*reach],[p.x-nx*reach,p.y,p.z-nz*reach]];
  });
  for(let i=1;i<pairs.length;i++)emit(pairs[i-1][0],pairs[i-1][1],pairs[i][1],pairs[i][0]);
}

// Canvas has no depth buffer. Finish every casing before painting any asphalt,
// then paint markings; depth sorting only breaks ties within a pass.
export function roadPass(color, palette) {
  return color===palette.sidewalk ? 3 : color===palette.roads ? 4 : 5;
}
