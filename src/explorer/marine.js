/** Source-mapped marine polygons and explicitly illustrative, not forecast, waves.
 * Owns no loading or frame loop. Positions use the explorer's local WGS84 frame.
 */
import {BufferGeometry,Color,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,ShaderMaterial,ShapeUtils,Vector2} from 'three';
import {project} from './geo.js';

const COLORS={reef:'#bd8f91',lagoon:'#58b9b6',ocean:'#82b9c8',foam:'#e1f1e5'};
const MAX_TRIANGLES=20000,FOAM_ROWS=32,FOAM_COLUMNS=24;
const STATIC_FOAM_TRIANGLES=FOAM_ROWS*FOAM_COLUMNS*4;
const vertexShader=/* glsl */`
 varying vec2 vOcean;
 void main(){
  vOcean=position.xz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
 }
`;
const fragmentShader=/* glsl */`
 uniform float uTime;
 uniform float uWaveScale;
 uniform vec3 uWater;
 uniform vec3 uFoam;
 varying vec2 vOcean;
 void main(){
  vec2 p=vOcean/uWaveScale;
  // Long, softly broken crests, with several incommensurate bends: not a grid.
  float bend=sin(p.x*.31+p.y*.12)*.58+sin(p.x*.073-p.y*.19)*.36;
  float phase=p.y*.91+p.x*.25+bend-uTime*.24;
  float crest=sin(phase);
  float aa=max(fwidth(crest),.015);
  float broken=smoothstep(-.35,.55,sin(p.x*.32+sin(p.y*.18)));
  float foam=smoothstep(.91-aa,.98+aa,crest)*broken;
  float swell=sin(p.x*.16-p.y*.21+uTime*.065)*.025;
  gl_FragColor=vec4(mix(uWater*(.985+swell),uFoam,foam*.55),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }
`;

function ringArea(points){
 const origin=points[0];let area=0;
 for(let i=1;i<points.length-1;i++)area+=(points[i].x-origin.x)*(points[i+1].y-origin.y)-(points[i+1].x-origin.x)*(points[i].y-origin.y);
 return Math.abs(area)*.5;
}
function projectedRing(ring){
 if(!Array.isArray(ring)||ring.length<4)throw new Error('Marine polygon ring needs at least four closed coordinates');
 const first=ring[0],last=ring[ring.length-1];
 if(!Array.isArray(first)||!Array.isArray(last)||first[0]!==last[0]||first[1]!==last[1])throw new Error('Marine polygon ring is open');
 const result=ring.slice(0,-1).map(point=>{
  if(!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1])||Math.abs(point[0])>180||Math.abs(point[1])>85)throw new Error('Marine polygon ring has invalid finite WGS84 coordinates');
  const p=project(point);return new Vector2(p.x,p.z);
 });
 if(ringArea(result)<=1e-7)throw new Error('Marine polygon ring has zero area');
 return result;
}
function appendPolygon(target,rings,ground,remaining){
 if(!Array.isArray(rings)||!rings.length)throw new Error('Marine polygon has no rings');
 if(rings.reduce((sum,ring)=>sum+(ring?.length??0),0)>MAX_TRIANGLES*3)throw new RangeError('Marine polygon exceeds the geometry budget');
 const [outer,...holes]=rings.map(projectedRing),points=[outer,...holes].flat();
 const faces=ShapeUtils.triangulateShape(outer,holes);
 if(faces.length>remaining)throw new RangeError('Marine triangles exceed the 20000 triangle budget');
 // Earcut can ignore malformed holes. Do not silently fill or lose source area.
 const expected=ringArea(outer)-holes.reduce((sum,hole)=>sum+ringArea(hole),0);
 let actual=0;
 for(const [i,j,k] of faces){const a=points[i],b=points[j],c=points[k];actual+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5;}
 if(expected<=0||!faces.length||Math.abs(actual-expected)>Math.max(1e-6,expected*1e-6))throw new Error('Marine polygon or holes could not be triangulated without losing source area');
 const heights=points.map(p=>{
  const height=ground({x:p.x,z:p.y})+.09;
  if(!Number.isFinite(height)||!Number.isFinite(Math.fround(height)))throw new Error('Marine terrain height must be finite');
  return height;
 });
 for(const face of faces)for(const index of face){const p=points[index];target.push(p.x,heights[index],p.y);}
 return faces.length;
}
function quad(out,a,b,c,d){out.push(...a,...b,...c,...a,...c,...d);}
function oceanPositions(){
 const out=[];quad(out,[-30000,-.05,-30000],[-30000,-.05,30000],[30000,-.05,30000],[30000,-.05,-30000]);return out;
}
function foamPositions(){
 const out=[];
 // One fixed merged mesh for Canvas2D: build once, never regenerate per frame.
 for(let row=0;row<FOAM_ROWS;row++)for(let col=0;col<FOAM_COLUMNS;col++){
  const seed=row*FOAM_COLUMNS+col;
  const x=(col-FOAM_COLUMNS*.5)*760+Math.sin(seed*2.17)*180;
  const z=(row-FOAM_ROWS*.5)*570+Math.cos(seed*1.13)*120;
  const length=160+(Math.sin(seed*1.79)+1)*100,width=2.5+(Math.cos(seed*.83)+1)*1.5;
  const point=(t,side)=>[x+t*length,-.05,z+t*length*.24+Math.sin(t*Math.PI)*width*2+side*width];
  for(let segment=0;segment<2;segment++){
   const a=segment*.5,b=(segment+1)*.5;quad(out,point(a,-1),point(b,-1),point(b,1),point(a,1));
  }
 }
 return out;
}

/** tick takes absolute foreground-clock seconds and numeric viewport world span.
 * animate=false (hidden/reduced-motion) or setWaves(false) freezes visible water.
 * The first resumed tick only reanchors; elapsed paused time never jumps waves.
 */
export function createMarineLayer(dataset,{software=false,ground=()=>0,waterColor=COLORS.ocean}={}){
 if(!Array.isArray(dataset?.features))throw new Error('Marine dataset features must be an array');
 const buckets={reef:[],lagoon:[]};let triangleCount=2+(software?STATIC_FOAM_TRIANGLES:0);
 for(const feature of dataset.features){
  if(!Object.hasOwn(buckets,feature?.kind))throw new Error('Unknown marine feature kind');
  const geometry=feature.geometry;
  const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;
  if(!Array.isArray(polygons)||!polygons.length)throw new Error('Marine geometry must be Polygon or MultiPolygon');
  for(const rings of polygons)triangleCount+=appendPolygon(buckets[feature.kind],rings,ground,MAX_TRIANGLES-triangleCount);
 }
 const group=new Group();group.name='marine';
 const geometries=[],materials=[];
 function add(name,positions,material,color,isOcean=false){
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new Mesh(geometry,material);mesh.name=name;mesh.userData.color=color;
  mesh.userData.marineOcean=isOcean;
  if(!isOcean)mesh.userData.marineKind=name;
  mesh.renderOrder=isOcean?-2:1;mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  geometries.push(geometry);materials.push(material);group.add(mesh);return mesh;
 }
 for(const kind of ['lagoon','reef'])if(buckets[kind].length)add(kind,buckets[kind],new MeshBasicMaterial({color:COLORS[kind],side:DoubleSide,transparent:true,opacity:kind==='reef'?.82:.65,depthWrite:false}),COLORS[kind]);
 const uniforms={uTime:{value:0},uWaveScale:{value:240},uWater:{value:new Color(waterColor)},uFoam:{value:new Color(COLORS.foam)}};
 add('marineOcean',oceanPositions(),software?new MeshBasicMaterial({color:waterColor,side:DoubleSide}):new ShaderMaterial({uniforms,vertexShader,fragmentShader,side:DoubleSide}),waterColor,true);
 if(software){
  const foam=add('marineFoam',foamPositions(),new MeshBasicMaterial({color:COLORS.foam,side:DoubleSide,depthWrite:false}),COLORS.foam,true);
  foam.renderOrder=-1;
 }
 let disposed=false,wavesEnabled=true,animated=false,lastSeconds=null,waveTime=0;
 return {
  group,
  tick(seconds,view,animate){
   if(disposed)return false;
   if(Number.isFinite(view)&&view>0)uniforms.uWaveScale.value=Math.max(3,Math.min(350,view/24));
   const active=!software&&wavesEnabled&&animate===true&&Number.isFinite(seconds);
   let changed=false;
   if(active&&animated&&lastSeconds!==null&&seconds>lastSeconds){
    waveTime+=seconds-lastSeconds;uniforms.uTime.value=waveTime;changed=true;
   }
   animated=active;lastSeconds=Number.isFinite(seconds)?seconds:null;
   return changed;
  },
  setWaves(enabled){if(disposed)return;const next=!!enabled;if(wavesEnabled===next)return;wavesEnabled=next;animated=false;lastSeconds=null;},
  stats(){return {
   meshCount:disposed?0:group.children.length,triangleCount:disposed?0:triangleCount,
   geometryCount:disposed?0:geometries.length,materialCount:disposed?0:materials.length,
   geometryIds:geometries.map(g=>g.id),bufferIds:geometries.map(g=>g.attributes.position.id),
   waveTime,animated,wavesEnabled,software,disposed
  };},
  dispose(){
   if(disposed)return;disposed=true;animated=false;lastSeconds=null;
   group.removeFromParent();group.clear();
   for(const geometry of geometries)geometry.dispose();
   for(const material of materials)material.dispose();
   geometries.length=0;materials.length=0;
  }
 };
}
