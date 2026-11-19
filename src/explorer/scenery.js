/** Original illustrative landmark meshes, not surveyed geology or photogrammetry.
 * Coordinates are local, in 10-metre world units. The caller anchors these at
 * the mapped landmark and releases the resulting geometry when it leaves view.
 * Plain triangles work with both the WebGL and software renderers.
 */
export const EARTH_COLORS=['#a96345','#bd8051','#c19a62','#957359','#887283','#aa777a','#78836a'];
const TAU=Math.PI*2;
const random=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
function triangle(out,color,a,b,c){out.push({color,a,b,c});}
function quad(out,color,a,b,c,d){triangle(out,color,a,b,c);triangle(out,color,a,c,d);}
function ellipse(out,color,x,y,z,rx,rz,segments=32){
 for(let i=0;i<segments;i++){
  const a=i*TAU/segments,b=(i+1)*TAU/segments;
  triangle(out,color,[x,y,z],[x+Math.cos(b)*rx,y,z+Math.sin(b)*rz],[x+Math.cos(a)*rx,y,z+Math.sin(a)*rz]);
 }
}
function crown(out,color,x,y,z,rx,ry,rz){
 const n=7;
 for(let i=0;i<n;i++){
  const a=i*TAU/n,b=(i+1)*TAU/n;
  const p=[x+Math.cos(a)*rx,y,z+Math.sin(a)*rz],q=[x+Math.cos(b)*rx,y,z+Math.sin(b)*rz];
  triangle(out,color,[x,y+ry,z],p,q);
  triangle(out,color,[x,y-ry*.65,z],q,p);
 }
}
function tree(out,x,y,z,seed){
 const h=.8+random(seed)*.7,r=.5+random(seed+1)*.4;
 for(let i=0;i<5;i++){
  const a=i*TAU/5,b=(i+1)*TAU/5;
  quad(out,'#766448',[x+Math.cos(a)*.07,y,z+Math.sin(a)*.07],[x+Math.cos(b)*.07,y,z+Math.sin(b)*.07],[x+Math.cos(b)*.07,y+h,z+Math.sin(b)*.07],[x+Math.cos(a)*.07,y+h,z+Math.sin(a)*.07]);
 }
 const shades=['#356647','#42794d','#548854','#658c52'];
 crown(out,shades[seed%4],x,y+h,z,r,.55,r*.85);
 crown(out,shades[(seed+1)%4],x+r*.4,y+h+.28,z-.1,r*.65,.4,r*.65);
}
function dunes(out){
 const rings=14,sectors=48;
 function point(r,i){
  const angle=i*TAU/sectors,edge=1+.065*Math.sin(angle*3)+.035*Math.cos(angle*7);
  const x=Math.cos(angle)*r*6*edge,z=Math.sin(angle)*r*4.5*edge;
  const ridge=.62+.32*Math.sin(x*1.35+z*.65)+.18*Math.cos(z*2-x*.4);
  return [x,.09+(1-r*r)*Math.max(.14,ridge),z];
 }
 function emit(a,b,c){
  const x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3;
  const band=Math.floor((x+6+Math.sin(z*.8)*.7)*.9);
  triangle(out,EARTH_COLORS[((band%7)+7)%7],a,b,c);
 }
 for(let ring=0;ring<rings;ring++)for(let i=0;i<sectors;i++){
  const a=point(ring/rings,i),b=point((ring+1)/rings,i),c=point((ring+1)/rings,i+1),d=point(ring/rings,i+1);
  emit(a,c,b);if(ring)emit(a,d,c);
 }
 // Broadleaf canopy frames the bare earth; no trees grow on the coloured patch.
 for(let i=0;i<72;i++){
  const a=random(i+400)*TAU,r=7.1+random(i)*3.5;
  tree(out,Math.cos(a)*r,.08,Math.sin(a)*r*.8,i);
 }
}
function waterfall(out){
 // Raised artistic cliff relief keeps the model compatible with flat fallback
 // terrain; it does not claim to reproduce the actual gorge cross section.
 const steps=32,layers=6,rocks=['#77765c','#a3936c','#827c61','#b3a077','#78735b','#9e926d'];
 function cliff(i,layer){
  const angle=Math.PI+(i/steps)*Math.PI;
  const r=9.5+.4*Math.sin(i*1.7),y=.12+layer/layers*9.88;
  return [Math.cos(angle)*r,y,-.5+Math.sin(angle)*(layer===layers?4:4.6)];
 }
 for(let i=0;i<steps;i++)for(let layer=0;layer<layers;layer++){
  quad(out,rocks[(layer+Math.floor(i/4))%rocks.length],cliff(i,layer),cliff(i+1,layer),cliff(i+1,layer+1),cliff(i,layer+1));
 }
 // The woodland follows an irregular curved shoulder rather than a rectangular
 // block. The back and side skirts taper into the surrounding ground.
 const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 function rear(i){
  const a=Math.PI+i/steps*Math.PI;
  return [Math.cos(a)*(9.5+.35*Math.sin(i*1.7)),10+.12*Math.sin(i*.8),-5.8+Math.sin(a)*(5.5+.3*Math.cos(i))];
 }
 for(let i=0;i<steps;i++){
  const a=cliff(i,layers),b=cliff(i+1,layers);
  quad(out,i%3?'#64844d':'#718f57',a,rear(i),rear(i+1),b);
 }
 const edge=[cliff(0,layers),...Array.from({length:steps+1},(_,i)=>rear(i)),cliff(steps,layers)];
 const toe=edge.map((p,i)=>[p[0]*(1.3+.05*Math.sin(i*1.2)),.08,p[2]-2.5-.7*Math.cos(i*.8)]);
 for(let i=0;i<edge.length-1;i++)for(let j=0;j<4;j++){
  const t=j/4,u=(j+1)/4;
  quad(out,j%2?'#77855d':rocks[(i+j)%rocks.length],lerp(edge[i],toe[i],t),lerp(edge[i+1],toe[i+1],t),lerp(edge[i+1],toe[i+1],u),lerp(edge[i],toe[i],u));
 }
 ellipse(out,'#5e8b78',0,.16,1,7,5);
 ellipse(out,'#508e8d',0,.22,.4,4.8,3.3);
 ellipse(out,'#6faeaa',0,.25,-.2,3.2,2.2);
 // Opaque sheet is intentionally present even if animations are disabled.
 for(let j=0;j<18;j++){
  const t=j/18,u=(j+1)/18;
  const point=(v,side)=>[side*(.55+v*.3),10-v*9.55,-4.52+v*v*3.3];
  quad(out,j%3?'#d8eee5':'#a8d5cf',point(t,-1),point(t,1),point(u,1),point(u,-1));
 }
 // River arriving at the lip, and foam at the foot.
 quad(out,'#70aba3',[-.45,10.035,-10],[.45,10.035,-10],[.55,10.035,-4.52],[-.55,10.035,-4.52]);
 ellipse(out,'#d6e9df',0,.29,-.9,1.7,.75,24);
 for(let i=0;i<58;i++){
  const index=1+Math.floor(random(i+80)*(steps-2));
  const p=lerp(cliff(index,layers),rear(index),.15+random(i+180)*.75);
  // Keep the narrow upstream channel legible through the forest canopy.
  if(Math.abs(p[0])>.65)tree(out,p[0],p[1],p[2],i);
 }
 for(let i=0;i<32;i++){
  const index=Math.floor(random(i+500)*edge.length),t=.2+random(i+600)*.65;
  const p=lerp(edge[index],toe[index],t);
  tree(out,p[0],p[1],p[2],i+80);
 }
 // Irregular valley-side clusters leave the basin and falling water open.
 for(let i=0;i<28;i++){
  const x=(i%2?1:-1)*(7.7+random(i+200)*3.5),z=-.2+random(i+300)*7;
  tree(out,x,.08,z,i+120);
 }
}
function mountain(out){
 // A broad, offset basalt crown and abrupt walls, not a conical volcano.
 // These heights are relief above the foothill datum, NOT summit DEM offsets.
 const sectors=64,radii=[0,.2,.4,.52,.61,.78,1],heights=[51,48,43,39,11,5,0];
 function point(ring,i){
  if(!ring)return [-10,51,-3];
  const a=i*TAU/sectors,r=radii[ring],rough=1+.065*Math.sin(a*5)+.035*Math.cos(a*9);
  const cx=Math.cos(a),sz=Math.sin(a);
  const x=-10*(1-r)+Math.sign(cx)*Math.pow(Math.abs(cx),.75)*66*r*rough;
  const z=-3*(1-r)+Math.sign(sz)*Math.pow(Math.abs(sz),.8)*43*r*rough;
  const ridge=ring===6?0:(1-r)*3.2*Math.sin(a*2+.7)+Math.sin(a*7)*.55;
  return [x,Math.max(0,heights[ring]+ridge),z];
 }
 const rocks=['#777766','#8a8673','#6c7365','#9b937d'],greens=['#597b50','#658452','#718a58'];
 for(let ring=0;ring<radii.length-1;ring++)for(let i=0;i<sectors;i++){
  const a=point(ring,i),b=point(ring+1,i),c=point(ring+1,i+1),d=point(ring,i+1);
  const color=ring===3?rocks[Math.floor(i/3)%rocks.length]:greens[ring%greens.length];
  triangle(out,color,a,c,b);if(ring)triangle(out,color,a,d,c);
 }
 for(let i=0;i<80;i++){
  const index=Math.floor(random(i+900)*sectors),t=.12+random(i+1000)*.8;
  const a=point(5,index),b=point(6,index),p=a.map((v,j)=>v+(b[j]-v)*t);
  tree(out,p[0],p[1],p[2],i+200);
 }
}
function crater(out){
 // Forested volcanic crater: a low interior, steep inner bowl and wooded rim.
 // The entire model is nonnegative so it can sit on a level terrain plinth.
 const sectors=56,radii=[0,3,7,12,16,21],heights=[.08,.2,1.1,4.8,6.4,0];
 function point(ring,i){
  if(!ring)return [0,.08,0];
  const a=i*TAU/sectors,edge=1+.035*Math.sin(a*3)+.025*Math.cos(a*5),r=radii[ring];
  return [Math.cos(a)*r*edge,Math.max(0,heights[ring]+(ring===5?0:.22*Math.sin(a*3))),Math.sin(a)*r*.86*edge];
 }
 const ground=['#576b46','#6d7650','#657b4c','#577847','#6b8652'];
 for(let ring=0;ring<radii.length-1;ring++)for(let i=0;i<sectors;i++){
  const a=point(ring,i),b=point(ring+1,i),c=point(ring+1,i+1),d=point(ring,i+1);
  triangle(out,ground[ring],a,c,b);if(ring)triangle(out,ground[ring],a,d,c);
 }
 // Uneven clusters preserve sightlines into the central depression.
 for(let i=0;i<112;i++){
  const ring=i%3===0?2:3+(i%2),index=Math.floor(random(i+1100)*sectors),t=random(i+1200);
  const a=point(ring,index),b=point(ring+1,index),p=a.map((v,j)=>v+(b[j]-v)*t);
  tree(out,p[0],p[1],p[2],i+300);
 }
}
function cuboid(out,color,x,y,z,w,h,d){
 const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],e=[x-w/2,y,z+d/2];
 const top=p=>[p[0],p[1]+h,p[2]],points=[a,b,c,e];
 for(let i=0;i<4;i++)quad(out,color,points[i],points[(i+1)%4],top(points[(i+1)%4]),top(points[i]));
 quad(out,color,top(a),top(e),top(c),top(b));
}
function pavilion(out,x,y,z){
 cuboid(out,'#c8bea1',x,y,z,2.5,.22,2.1);
 for(const dx of [-.85,.85])for(const dz of [-.65,.65])cuboid(out,'#ddd2b6',x+dx,y+.22,z+dz,.15,1.5,.15);
 const corners=[[-1.4,-1.2],[1.4,-1.2],[1.4,1.2],[-1.4,1.2]];
 for(let i=0;i<4;i++){
  const a=corners[i],b=corners[(i+1)%4];
  triangle(out,'#a76d52',[x+a[0],y+1.75,z+a[1]],[x,y+2.35,z],[x+b[0],y+1.75,z+b[1]]);
 }
}
function lake(out){
 // Original calm-water illustration of a sacred lake. Small generic pavilions
 // and access steps are decorative, not replicas of religious structures.
 const sectors=64;
 function bank(r,i,y){
  const a=i*TAU/sectors,edge=1+.075*Math.sin(a*3)+.045*Math.cos(a*5);
  return [Math.cos(a)*18*r*edge,y,Math.sin(a)*13*r*edge];
 }
 const rings=[1,1.12,1.35],levels=[.2,.7,0],shades=['#94a177','#6f8958'];
 for(let i=0;i<sectors;i++){
  triangle(out,i%7?'#52908c':'#579591',[0,.2,0],bank(1,i+1,.2),bank(1,i,.2));
  for(let ring=0;ring<2;ring++){
   const a=bank(rings[ring],i,levels[ring]),b=bank(rings[ring+1],i,levels[ring+1]),c=bank(rings[ring+1],i+1,levels[ring+1]),d=bank(rings[ring],i+1,levels[ring]);
   quad(out,shades[ring],a,d,c,b);
  }
 }
 // Subtle short glints, not a noisy texture or ocean waves.
 for(let i=0;i<20;i++){
  const x=(random(i+1300)-.5)*23,z=(random(i+1400)-.5)*14,w=.3+random(i)*.8;
  quad(out,'#70aaa2',[x-w,.205,z],[x+w,.205,z],[x+w*.7,.205,z+.045],[x-w*.7,.205,z+.045]);
 }
 for(let i=0;i<96;i++){
  const index=Math.floor(random(i+1500)*sectors),r=1.14+random(i+1600)*.16;
  const p=bank(r,index,.7*(1-(r-1.12)/.23));
  if(p[0]>16&&Math.abs(p[2])<4)continue;
  tree(out,p[0],p[1],p[2],i+420);
 }
 pavilion(out,21.5,.7,0);
 for(let i=0;i<4;i++)cuboid(out,'#c5bda5',18.9+i*.4,.19,0,.42,.13+i*.12,2.2);
}
export function sceneryTriangles(kind){
 const out=[];
 if(kind==='dunes')dunes(out);
 else if(kind==='waterfall')waterfall(out);
 else if(kind==='mountain')mountain(out);
 else if(kind==='crater')crater(out);
 else if(kind==='lake')lake(out);
 else throw new RangeError('Unknown scenery kind: '+kind);
 return out;
}
/** Small moving highlights over the static waterfall. Time is in seconds.
 * Reuse a fixed-size position buffer rather than allocate meshes every frame.
 */
export function waterTriangles(time=0){
 const out=[];if(!Number.isFinite(time))time=0;
 for(let i=0;i<16;i++){
  const t=((time*.35+i/16)%1+1)%1,u=Math.min(.995,t+.045);
  const start=Math.min(t,.95),x=(random(i+50)-.5)*.8;
  const p=(v,s)=>[x+s*.025,10-v*9.55,-4.49+v*v*3.3];
  quad(out,'#f4faf0',p(start,-1),p(start,1),p(u,1),p(u,-1));
 }
 return out;
}
