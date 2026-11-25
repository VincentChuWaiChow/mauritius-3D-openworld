import {mountWeather} from './weather.js';
import {surfaceTextures} from './surface-textures.js';
import {createStreetLayout,roadStyle} from './street-layout.js';
import {sceneryPlacement,scenerySkirt} from './scenery-placement.js';
import {withLandmarks,nearbyLandmarks,sceneryVegetationArea} from './landmarks.js';
import {searchPlaces,panelAlpha} from './search.js';
import {TerrainSurface} from './surface.js';
import {TileStore,visibleTileKeys} from './streaming.js';
import {trafficTile, readTraffic, refreshMs, congestionColors, normalizeTrafficToken} from './traffic.js';
import {ribbon,roadPass} from './road-ribbon.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {project, unproject} from './geo.js';
import {TerrainCache, buildTerrainGeometry} from './terrain.js';
import {THEMES,selectLook,windowSlots} from './style.js';
import {selectBuildingCluster,cameraSpan} from './focus.js';
document.documentElement.dataset.started='true';
const assets=import.meta.env.BASE_URL+'explorer/';
const $=id=>document.getElementById(id),host=$('world');
const scene=new THREE.Scene();scene.background=new THREE.Color('#82b9c8');
const camera=new THREE.OrthographicCamera(-150,150,120,-120,.1,22000);
let renderer,software=false,controls,data,current,overviewMode=false,topMode=false,span=220,dirty=true,lastRender=0,heightScale=1;
let surface=null,terrainLoad=null;
let terrainMeshes=null,demActive=false,demToken=0,themeId='little',sun;
let cameraMode='close', selectedBuilding=null;
// Orthographic scale is measured in world units across the viewport height.
const MIN_VIEW=3, MAX_VIEW=15500, held=new Set();
let desiredView=null, anchor=null, previousFrame=null, motionTime=0, lastCarTime=-Infinity, roamKey='', roamGeneration=0, lastCheck=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const view=()=>span/camera.zoom;
function setView(h){
 camera.zoom=span/THREE.MathUtils.clamp(h,MIN_VIEW,MAX_VIEW);
 camera.updateProjectionMatrix(); dirty=true;
}
function queueZoom(factor,point=null){
 roadTapVersion++;animation=null; anchor=point; desiredView=THREE.MathUtils.clamp((desiredView??view())*factor,MIN_VIEW,MAX_VIEW);
}
const focusCache=new Map();
const elevation=new TerrainCache(), textures=surfaceTextures(assets,()=>{dirty=true;},failedTexture);
let groups={},markers=[],buildingHits=[],cars=[],cpuFaces=[],animation=null,renderedStreet=null;
const colors={...THEMES.little};
const fromGeo=point=>{const p=project(point);return new THREE.Vector3(p.x,0,p.z)};
const vector=(x,y,z)=>new THREE.Vector3(x,y,z);
const root=new THREE.Group();scene.add(root);
const carPoint=new THREE.Vector3(),carTangent=new THREE.Vector3(),sunShift=new THREE.Vector3();
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
function seeded(n){let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)}
function bucket(group,color){group.userData.buckets??=new Map();if(!group.userData.buckets.has(color))group.userData.buckets.set(color,[]);return group.userData.buckets.get(color)}
function tri(group,color,a,b,c){bucket(group,color).push(...a,...b,...c)}
function quad(g,c,a,b,d,e){tri(g,c,a,b,d);tri(g,c,a,d,e)}
function box(g,c,x,y,z,w,h,d){let x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y1=y+h;quad(g,c,[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]);quad(g,c,[x0,y,z0],[x0,y1,z0],[x1,y1,z0],[x1,y,z0]);quad(g,c,[x1,y,z0],[x1,y1,z0],[x1,y1,z1],[x1,y,z1]);quad(g,c,[x1,y,z1],[x1,y1,z1],[x0,y1,z1],[x0,y,z1]);quad(g,c,[x0,y,z1],[x0,y1,z1],[x0,y1,z0],[x0,y,z0]);}
function cone(g,c,x,y,z,r,h,sides=6){for(let i=0;i<sides;i++){let a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;tri(g,c,[x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x,y+h,z],[x+Math.cos(b)*r,y,z+Math.sin(b)*r]);}}
function polygon(g,c,pts,y){if(pts.length<3)return;const contour=pts.map(p=>new THREE.Vector2(p.x,p.z));const indices=THREE.ShapeUtils.triangulateShape(contour,[]);const offset=v=>g.name==='buildings'?0:groundY(v);for(const [a,b,d] of indices)tri(g,c,[pts[a].x,offset(pts[a])+y,pts[a].z],[pts[d].x,offset(pts[d])+y,pts[d].z],[pts[b].x,offset(pts[b])+y,pts[b].z]);}
function groundY(point){return demActive&&surface?surface.sceneHeight(point):0;}
function path(g,c,pts,width,y,layout=null){
 const samples=[];
 for(let i=0;i<pts.length;i++){
   const b=pts[i],a=pts[i-1]??b, dx=b.x-a.x,dz=b.z-a.z;
   const n=demActive?Math.min(60,Math.max(1,Math.ceil(Math.hypot(dx,dz)/6))):1;
   for(let j=1;j<=n;j++){
     const x=a.x+dx*j/n,z=a.z+dz*j/n;
     samples.push({x,z,y:groundY({x,z})+y});
   }
 }
 ribbon(samples,width,(a,b,d,e)=>{
  for(const patch of layout?layout.clipRoad([a,b,d,e]):[[a,b,d,e]]){
   if(demActive&&surface)surface.drape(patch.map(p=>[p[0],p[2]]),y,(v1,v2,v3)=>tri(g,c,v1,v2,v3));
   else for(let i=1;i<patch.length-1;i++)tri(g,c,patch[0],patch[i],patch[i+1]);
  }
 });
}
function materialFor(group,color){
 const name=group.name;
 if(name==='roadSelection')return new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,toneMapped:false,depthWrite:false});
 let pattern;
 if(name==='roads')pattern=color===colors.roads?'asphalt':null;
 if(name==='land')pattern=color===colors.shore?'coral-sand':color===colors.land?'grassland':null;
 if(name==='nature'&&color===colors.park)pattern='grassland';
 if(name==='buildings'){
   const wall=colors.walls.indexOf(color),roof=colors.roofs.indexOf(color);
   pattern=wall>=0?['stucco','window-grid','masonry','stucco'][wall]:roof>=0?['roof-terracotta','roof-pale','roof-metal','roof-concrete','roof-pale','roof-terracotta'][roof]:null;
 }
 const options={color,side:THREE.DoubleSide,roughness:.94,metalness:.0,flatShading:true};
 if(pattern&&!software)options.map=textureFor(pattern);
 return new THREE.MeshStandardMaterial(options);
}
function compile(g){for(const [color,positions]of g.userData.buckets||[]){
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const uv=[];for(let i=0;i<positions.length;i+=9){
   const ax=positions[i],ay=positions[i+1],az=positions[i+2];
   const bx=positions[i+3],by=positions[i+4],bz=positions[i+5];
   const cx=positions[i+6],cy=positions[i+7],cz=positions[i+8];
   const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay), ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az), nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
   const roof=Math.abs(ny)>Math.abs(nx)*.7&&Math.abs(ny)>Math.abs(nz)*.7;
   for(let j=i;j<i+9;j+=3){const x=positions[j],y=positions[j+1],z=positions[j+2];
     const u=roof?x*.43:(Math.abs(nx)>Math.abs(nz)?z*.6:x*.6);
     const v=roof?z*.43:y*.9;uv.push(u,v);
   }
 }
 geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,materialFor(g,color));mesh.userData.color=color;
 mesh.castShadow=g.name==='buildings';mesh.receiveShadow=g.name==='buildings'||g.name==='land';g.add(mesh);
 }delete g.userData.buckets;}
function failedTexture(texture){
 root.traverse(({material})=>{if(material?.map===texture){material.map=null;material.needsUpdate=true;}});
}
function textureFor(name){return textures(name);}
function group(name){const g=new THREE.Group();g.name=name;root.add(g);groups[name]=g;return g;}
function tree(g,x,z,size=1,seed=0){if(sceneryVegetationArea({x,z}))return;const floor=groundY({x,z});box(g,'#887b51',x,floor+.1,z,.2*size,1.1*size,.2*size);cone(g,['#3f8356','#548e56','#609a5b','#408c65'][seed%4],x,floor+.75*size,z,.85*size,1.5*size,5);cone(g,'#76a966',x,floor+1.5*size,z,.6*size,1.1*size,5);}
function palm(g,x,z,size=1){if(sceneryVegetationArea({x,z}))return;const floor=groundY({x,z});box(g,'#a48a61',x,floor+.1,z,.15*size,1.7*size,.15*size);for(let i=0;i<6;i++){const a=i*Math.PI/3;const dx=Math.cos(a),dz=Math.sin(a);tri(g,i%2?'#4b9577':'#378367',[x,floor+1.9*size,z],[x+dx*1.2*size-dz*.22*size,floor+1.5*size,z+dz*1.2*size+dx*.22*size],[x+dx*1.5*size,floor+1.3*size,z+dz*1.5*size]);}}
function clearWorld(){renderedStreet=null;lastCarTime=-Infinity;sceneryKey='';markers.forEach(m=>m.el.remove());markers=[];cars=[];buildingHits=[];selectedBuilding=null;cpuFaces=[];root.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose()});root.clear();groups={};$('detail').hidden=true;}
function inPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.z>p.z)!==(b.z>p.z))&&(p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x))inside=!inside;}return inside;}
function heightMeters(value){
 if(value==null)return NaN;
 const text=String(value).trim().toLowerCase().replace(',','.');
 const m=text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(m|metre|meter|metres|meters|ft|feet|')?$/);
 if(!m)return NaN;
 return Number(m[1])*(m[2]==='ft'||m[2]==='feet'||m[2]==="'"?.3048:1);
}
function buildRoof(g,points,roof,wall,y,height,look){
 polygon(g,roof,points,y+height);
 if(points.length!==4||height>1.9||!look.pitched)return;
 const edge=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%4].x,p.z-points[(i+1)%4].z));
 if(Math.min(...edge)<.65||Math.max(...edge)>9)return;
 const mids=(i,j)=>[(points[i].x+points[j].x)/2,(points[i].z+points[j].z)/2];
 const first=edge[0]>=edge[1]?[0,3,1,2]:[0,1,3,2];
 const [a,b,c,d]=first, ridgeA=mids(a,b),ridgeB=mids(c,d),rise=Math.min(.44,Math.min(...edge)*.29);
 const v=(i,yy)=>[points[i].x,yy,points[i].z],r=(mid)=>[mid[0],y+height+rise,mid[1]];
 quad(g,roof,v(a,y+height),v(c,y+height),r(ridgeB),r(ridgeA));
 quad(g,roof,v(b,y+height),v(d,y+height),r(ridgeB),r(ridgeA));
 tri(g,wall,v(a,y+height),v(b,y+height),r(ridgeA));
 tri(g,wall,v(c,y+height),v(d,y+height),r(ridgeB));
}
function marker(name,icon,position,action){const el=document.createElement('button');el.className='pin';el.setAttribute('aria-label',name);el.innerHTML=icon+'<span></span>';el.querySelector('span').textContent=name;el.onclick=action;$('labels').append(el);markers.push({el,position});}
let roadModule=null,roadIndex=null,roadLoad=null,roadRetryAfter=0;
const roadsByWay=new Map(),roadGeometryCache=new Map();
let roadPickPaths=[],roadPointer=null,roadHover=null,lastRoadProbe=0,roadDragging=false,roadTapVersion=0;
let selectedRoad=null,roadSelectionVersion=0,roadSelectionRequest=null,roadOutlineWidth=0;
async function loadRoadData(retry=false){
 if(roadIndex)return true;
 if(!retry&&Date.now()<roadRetryAfter)return false;
 if(!roadLoad)roadLoad=Promise.all([import('./roads.js'),fetch(assets+'roads/index.json').then(r=>{if(!r.ok)throw Error('Road names unavailable');return r.json();})])
  .then(([module,index])=>{
   if(index.version!==1||!Array.isArray(index.roads))throw Error('Road names unavailable');
   roadModule=module;roadIndex=index;
   for(const road of index.roads)for(const id of road.wayIds)roadsByWay.set(id,road);
   dirty=true;return true;
  }).catch(()=>{roadRetryAfter=Date.now()+30000;return false;}).finally(()=>{roadLoad=null;});
 return roadLoad;
}
function clearRoadHover(keepPointer=false){if(!keepPointer)roadPointer=null;roadHover=null;$('road-tooltip').hidden=true;}
function drawSelectedRoad(){
 const old=groups.roadSelection;
 if(old){old.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});root.remove(old);delete groups.roadSelection;}
 if(selectedRoad?.paths){
  const g=group('roadSelection');roadOutlineWidth=Math.max(.18,view()/host.clientHeight*3.5);
  for(const points of selectedRoad.paths){const line=points.map(fromGeo);path(g,'#fffef8',line,roadOutlineWidth*2,.095);path(g,'#175b45',line,roadOutlineWidth,.105);}
  compile(g);
 }
 if(software)collectFaces();dirty=true;
}
function clearRoadSelection(){
 const hadSelection=!!selectedRoad;
 roadTapVersion++;roadSelectionVersion++;roadSelectionRequest?.abort();roadSelectionRequest=null;
 selectedRoad=null;clearRoadHover();$('road-selection').hidden=true;$('road-locator').hidden=true;
 document.body.classList.remove('has-road-selection');camera.clearViewOffset();drawSelectedRoad();
 if(hadSelection)$('search-status').textContent='Road selection cleared.';
}
function screenRoads(){
 camera.updateMatrixWorld();
 return roadPickPaths.filter(r=>roadsByWay.has(r.wayId)).map(r=>({wayId:r.wayId,points:r.points.map(point=>{
  const p=point.clone().project(camera);
  return p.z>=-1&&p.z<=1?{x:(p.x+1)*host.clientWidth/2,y:(1-p.y)*host.clientHeight/2}:{x:NaN,y:NaN};
 })}));
}
function pickVisibleRoad(x,y,tolerance=8,ignoreBuildings=false){
 if(!roadModule||!groups.roads?.visible||overviewMode||roadDragging)return null;
 const picked=roadModule.pickRoad(screenRoads(),{x,y},tolerance);
 if(!picked)return null;
 if(!ignoreBuildings&&groups.buildings?.visible){
  pointer.set(x/host.clientWidth*2-1,1-y/host.clientHeight*2);raycaster.setFromCamera(pointer,camera);root.updateMatrixWorld(true);
  if(raycaster.intersectObjects(groups.buildings.children,false).length)return null;
 }
 return {...picked,road:roadsByWay.get(picked.wayId)};
}
function updateRoadHover(time){
 if(!roadPointer||roadDragging||animation||overviewMode||document.hidden||$('about').open){if(roadHover){roadHover=null;$('road-tooltip').hidden=true;}return;}
 if(time-lastRoadProbe<100)return;lastRoadProbe=time;
 if(!roadIndex){void loadRoadData();return;}
 const hit=pickVisibleRoad(roadPointer.x,roadPointer.y);
 roadHover=hit?.road??null;
 const tip=$('road-tooltip');tip.hidden=!roadHover;
 if(!roadHover)return;
 tip.querySelector('strong').textContent=roadHover.name;tip.querySelector('span').textContent=roadHover.locality;
 tip.style.left=Math.max(12,Math.min(host.clientWidth-260,roadPointer.x+14))+'px';
 tip.style.top=Math.max(90,Math.min(host.clientHeight-100,roadPointer.y+18))+'px';
}
function updateRoadLocator(){
 const marker=$('road-locator');
 if(!selectedRoad?.paths){marker.hidden=true;return;}
 const point=fromGeo(selectedRoad.anchor);point.y=groundY(point)+.11;point.project(camera);
 marker.hidden=point.z<-1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
 marker.style.left=(point.x+1)*host.clientWidth/2+'px';marker.style.top=(1-point.y)*host.clientHeight/2+'px';
 const width=Math.max(.18,view()/host.clientHeight*3.5);
 if(width/roadOutlineWidth>1.45||width/roadOutlineWidth<.69)drawSelectedRoad();
}
async function selectRoad(road){
 roadTapVersion++;const token=++roadSelectionVersion;roadSelectionRequest?.abort();roadSelectionRequest=new AbortController();
 const request=roadSelectionRequest;clearRoadHover();selectedRoad={road,paths:null};drawSelectedRoad();
 $('detail').hidden=true;$('place-results').hidden=true;
 document.body.classList.remove('search-active');document.body.classList.add('has-road-selection');
 $('road-selection').hidden=false;$('road-selection-name').textContent=road.name;$('road-selection-location').textContent=road.locality;
 $('road-selection-status').textContent='Loading mapped road…';$('road-source').href='https://www.openstreetmap.org/way/'+road.wayIds[0];
 $('place-query').value=road.name;
 try{
  let bucket=roadGeometryCache.get(road.bucket);
  if(!bucket){const response=await fetch(assets+'roads/'+road.bucket,{signal:request.signal});if(!response.ok)throw Error();bucket=await response.json();
   roadGeometryCache.set(road.bucket,bucket);while(roadGeometryCache.size>4)roadGeometryCache.delete(roadGeometryCache.keys().next().value);}
  if(token!==roadSelectionVersion||request.signal.aborted)return;
  const paths=bucket.roads?.[road.id]?.paths,anchorPoint=roadModule.pathAnchor(paths);
  if(!anchorPoint)throw Error();selectedRoad={road,paths,anchor:anchorPoint};
  searchLocation=null;streetRequest?.abort();roamGeneration++;roamKey='';
  const target=fromGeo(anchorPoint);target.y=groundY(target);
  const a=fromGeo(road.bounds.slice(0,2)),b=fromGeo(road.bounds.slice(2));
  const halfWidth=Math.max(Math.abs(a.x-target.x),Math.abs(b.x-target.x)),halfHeight=Math.max(Math.abs(a.z-target.z),Math.abs(b.z-target.z));
  const desired=Math.min(MAX_VIEW,Math.max(18,Math.max(halfHeight,halfWidth/(host.clientWidth/host.clientHeight))*2.7));
  const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('road-selection-status').textContent='Selected on the map · '+road.wayIds.length+' mapped '+(road.wayIds.length===1?'segment':'segments');
  $('search-status').textContent='Road selected · '+road.locality;
  pose(target,false,animate,'close');if(animation)animation.end=desired;else setView(desired);
  drawSelectedRoad();
  $('world-status').textContent='Selected road · '+road.name;dirty=true;
 }catch(error){if(token===roadSelectionVersion&&!request.signal.aborted){$('road-selection-status').textContent='Road geometry unavailable. Select the result again to retry.';}}
 finally{if(roadSelectionRequest===request)roadSelectionRequest=null;}
}
let trafficToken = normalizeTrafficToken(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN);
let trafficRequest, trafficKey = '', nextTrafficRead = 0, trafficLines = [], trafficStatus = '';
function applyTrafficToken(token) {
 trafficRequest?.abort(); trafficRequest = null;
 trafficToken = token; trafficKey = ''; nextTrafficRead = 0;
 trafficLines = []; trafficStatus = '';
 $('flow-enabled').disabled = !token;
 if (!token) $('flow-enabled').checked = false;
 drawTraffic(); updateTraffic();
}
function drawTraffic() {
 const layer = groups.flow;
 if (!layer) return;
 for (const mesh of layer.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
 layer.clear();
 for (const {level, points} of trafficLines) {
   const road = points.map(fromGeo);
   // Provider line order is normalized for a positive screen-space right offset.
   const shifted = road.map((p, i) => {
     const a = road[Math.max(0,i-1)], b = road[Math.min(road.length-1,i+1)];
     const length = Math.hypot(b.x-a.x,b.z-a.z) || 1;
     return {x:p.x-(b.z-a.z)*.16/length,z:p.z+(b.x-a.x)*.16/length};
   });
   path(layer,congestionColors[level],shifted,.16,.085);
 }
 compile(layer);
 if (software) collectFaces();
 dirty = true;
}
function updateTraffic() {
 const enabled = $('flow-enabled').checked && !overviewMode && !document.hidden;
 $('flow-credit').hidden = !enabled;
 const tile = enabled ? trafficTile(unproject(controls.target)) : null;
 const key = tile?.key || '';
 if (key !== trafficKey) {
   trafficRequest?.abort(); trafficRequest = null;
   trafficKey = key; trafficLines = []; drawTraffic();
   nextTrafficRead = Date.now() + 700;
   trafficStatus = key ? 'Looking up this tile…' : '';
 }
 const status = $('flow-status');
 const message = !trafficToken ? 'Requires a Mapbox public token.' : !enabled ?
   ($('flow-enabled').checked ? 'Zoom to streets for traffic.' : '') : trafficStatus;
 if (status.textContent !== message) status.textContent = message;
 if (!enabled || !trafficToken || trafficRequest || Date.now() < nextTrafficRead) return;
 nextTrafficRead = Date.now() + refreshMs;
 const request = new AbortController();
 trafficRequest = request;
 const timeout = setTimeout(() => request.abort(), 12000);
 readTraffic(tile,trafficToken,request.signal).then(lines => {
   if (trafficRequest !== request) return;
   trafficLines = lines;
   trafficStatus = lines.length ? 'Centre tile · fetched ' + new Date().toLocaleTimeString() :
     'No reported surface traffic in this tile.';
   drawTraffic();
 }).catch(error => {
   if (trafficRequest !== request) return;
   trafficLines = []; drawTraffic();
   trafficStatus = error.name === 'AbortError' ? 'Traffic request timed out.' : error.message;
 }).finally(() => {
   clearTimeout(timeout);
   if (trafficRequest === request) trafficRequest = null;
 });
}
function buildWorld(region,isOverview=false){clearWorld();if(region.id!=='free')current=region;overviewMode=isOverview;
 roadTapVersion++;clearRoadHover(true);roadPickPaths=isOverview?[]:region.roads.flatMap(road=>{
  const points=road.points.map(fromGeo);
  return demActive&&surface?surface.trace(points.map(p=>[p.x,p.z]),.06).map(line=>({wayId:road.id,points:line.map(p=>vector(...p))})):
   [{wayId:road.id,points:points.map(p=>p.setY(.06))}];
 });
 const land=group('land'),road=group('roads'),nature=group('nature'),build=group('buildings'),traffic=group('traffic');
 group('flow');
 const polys=data.land.map(r=>r.slice(0,-1).map(fromGeo));
 const currentMesh=terrainMeshes?.overview;
 if(demActive&&currentMesh){
   // An opaque THREE namespace argument prevents pruning its unused exports.
   const g=buildTerrainGeometry({BufferGeometry:THREE.BufferGeometry,Float32BufferAttribute:THREE.Float32BufferAttribute,Color:THREE.Color},currentMesh,surface,colors);
   const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,side:THREE.DoubleSide}));
   mesh.receiveShadow=true;mesh.userData.color=colors.land;land.add(mesh);
 }else for(const p of polys)polygon(land,colors.land,p,0);
 for(const p of polys)path(land,colors.shore,[...p,p[0]],isOverview?7:1.2,.035);
 const projectedRoads=(isOverview?data.mainRoads:region.roads).map(r=>({...r,points:r.points.map(fromGeo)}));
 const streetLayout=isOverview?null:createStreetLayout(region.buildings.map(b=>b.points.slice(0,-1).map(fromGeo)),projectedRoads);
 for(const r of streetLayout?.roads??projectedRoads){
  const {width,casing}=r.style??roadStyle(r.kind),pts=r.points;
  path(road,colors.sidewalk,pts,isOverview?Math.max(width,6):casing,.045,streetLayout);
  path(road,colors.roads,pts,isOverview?Math.max(width*.8,4):width,.055,streetLayout);
  if(!isOverview&&['motorway','trunk','primary','secondary'].includes(r.kind))path(road,'#d6d7bd',pts,.04,.065,streetLayout);
 }
 if(!isOverview){
 for(const p of region.parks)polygon(nature,colors.park,p.slice(0,-1).map(fromGeo),.075);
 for(const b of region.buildings){
  const p=b.points.slice(0,-1).map(fromGeo);if(p.length<3)continue;
  const bounds=new THREE.Box3().setFromPoints(p),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const rawHeight=heightMeters(b.height),levels=parseFloat(b.levels);
  const known=(Number.isFinite(rawHeight)&&rawHeight>0)||(Number.isFinite(levels)&&levels>0);
  const naturalHeight=Number.isFinite(rawHeight)&&rawHeight>0?rawHeight:Number.isFinite(levels)&&levels>0?levels*3:(5+seeded(b.id)*5);
  const h=THREE.MathUtils.clamp(naturalHeight,1.5,300)/10*heightScale;
  const ground=Math.max(...p.map(groundY)),foundation=Math.min(...p.map(groundY)),look=selectLook(b);
  const roof=colors.roofs[look.roof],wall=colors.walls[look.wall];
  // Appearance is art-directed. The polygon remains the mapped OSM footprint.
  if(!demActive)polygon(land,'#8ea779',p.map(v=>vector(v.x+.8,0,v.z+.5)),.02);
  if(region.simple)polygon(build,roof,p,ground+h);else buildRoof(build,p,roof,wall,ground,h,look);
  for(let i=0;i<p.length;i++){
    const a=p[i],d=p[(i+1)%p.length];
    quad(build,wall,[a.x,foundation-.02,a.z],[d.x,foundation-.02,d.z],[d.x,ground+h,d.z],[a.x,ground+h,a.z]);
    const dx=d.x-a.x,dz=d.z-a.z,len=Math.hypot(dx,dz);
    if(region.simple||len<.7||len>18)continue;
    const nx=dz/len*.016,nz=-dx/len*.016;
    for(const w of windowSlots(len,h,look.windowStyle)){
       const x=a.x+dx*w.t+nx,z=a.z+dz*w.t+nz;
       const u=dx/len*w.width/2,v=dz/len*w.width/2;
       const y0=ground+w.y,y1=y0+w.height;
       quad(build,'#456665',[x-u,y0,z-v],[x+u,y0,z+v],[x+u,y1,z+v],[x-u,y1,z-v]);
    }
  }
  if(!region.simple&&!look.pitched&&look.equipment&&size.x>.9&&size.z>.9){
    box(build,'#a7ad9b',center.x,ground+h,center.z,Math.min(size.x*.26,.85),.12,Math.min(size.z*.24,.8));
  }
  buildingHits.push({b,points:p,center:vector(center.x,ground+h,center.z),height:h,ground,known});
 }
 // Ornamental roadside trees: deliberately not presented as mapped tree locations.
 let n=0;for(const r of region.roads){
  if(r.points.length<2||seeded(r.id)>.55)continue;
  const pts=r.points.map(fromGeo),p=pts[Math.floor(pts.length/2)],a=pts[0],b=pts.at(-1);
  const palmTree=seeded(r.id+1)<.2,size=palmTree?.9:.7+seeded(r.id+2)*.6,radius=(palmTree?1.5:.85)*size;
  const setback=radius+roadStyle(r.kind).casing*.5+.2;
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,x=p.x-dz/len*setback,z=p.z+dx/len*setback;
  if(polys.some(poly=>inPolygon({x,z},poly))&&streetLayout.canPlant({x,z},radius)){
   if(palmTree)palm(nature,x,z,size);else tree(nature,x,z,size,n);
   if(++n>=180)break;
  }
 }
 for(const b of buildingHits.filter(b=>b.b.name).slice(0,8)){const icon=/bank/i.test(b.b.name)?'🏦':/mosq|church|temple/i.test(b.b.name)?'🏛':/market|shop|store/i.test(b.b.name)?'🛍':'📍';marker(b.b.name,icon,b.center,()=>showBuilding(b));}
 const selected=region.roads.filter(r=>['primary','secondary','tertiary','residential'].includes(r.kind)&&r.points.length>2).filter((r,i)=>i%7===0).slice(0,14);
 for(const [i,r]of selected.entries()){const g=new THREE.Group();traffic.add(g);const paint=['#efce67','#b95747','#e8e7dc','#367586','#94acb7'][i%5];
 box(g,paint,0,.045,0,.18,.075,.44);
 box(g,'#394f5b',0,.12,-.015,.155,.06,.22);
 box(g,paint,0,.18,-.015,.14,.016,.14);
 for(const x of [-.09,.09])for(const z of [-.135,.135])box(g,'#293133',x,.005,z,.025,.07,.075);
 for(const x of [-.061,.061]){box(g,'#fff0c5',x,.08,.22,.037,.025,.006);box(g,'#b83c37',x,.08,-.22,.037,.025,.006);}
 compile(g);const curve=new THREE.CurvePath();const pts=r.points.map(fromGeo);for(const p of pts)p.y=groundY(p)+.13;for(let j=1;j<pts.length;j++)curve.add(new THREE.LineCurve3(pts[j-1],pts[j]));cars.push({g,curve,lane:r.kind==='residential'?.15:.23,offset:seeded(r.id),speed:.7/Math.max(curve.getLength(),1)});}
 }else{
 for(const r of data.regions)marker(r.name,r.icon,fromGeo(r.center),()=>goRegion(r.id));
 // Overview uses DEM only. Named illustrative scenery loads in nearby detail views.
 }
 for(const g of [land,road,nature,build])compile(g);
 document.querySelectorAll('[data-layer]').forEach(input=>groups[input.dataset.layer].visible=input.checked);
 if(trafficLines.length && !isOverview)drawTraffic();
 if(selectedRoad?.paths)drawSelectedRoad();
 if(software)collectFaces();dirty=true;
 // Retain only the keys represented by this completed scene, never pending tiles.
 renderedStreet=!isOverview&&region.id==='free'?region:null;
}
// Geometry is imported only on approach; scene resources are discarded on departure.
let sceneryModule=null,sceneryLoading=null,sceneryKey='';
function updateScenery(){
 // Street tiles may fall back to the overview mesh before a large landmark
 // leaves the view. Keep scenery independent of that street-data fallback.
 const sites=nearbyLandmarks(controls.target,view(),overviewMode&&view()>450);
 const key=sites.map(s=>s.id).join(',')+':'+demActive+':'+reducedMotion.matches;
 if(!sites.length&&!groups.scenery)return;
 if(sites.length&&!sceneryModule){
  sceneryLoading??=import('./scenery.js').then(m=>{sceneryModule=m;sceneryKey='';}).catch(()=>{sceneryLoading=null;});
  return;
 }
 if(key===sceneryKey&&groups.scenery)return;
 if(groups.scenery){groups.scenery.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});root.remove(groups.scenery);delete groups.scenery;}
 sceneryKey=key;
 if(sites.length){
  const g=group('scenery');g.userData.sites=sites.map(s=>s.id);
  for(const site of sites){
   const origin=fromGeo(site.center);
   const point=sceneryPlacement(site,origin,groundY);
   const triangles=sceneryModule.sceneryTriangles(site.scenery);
   for(const f of triangles)tri(g,f.color,point(f.a),point(f.b),point(f.c));
   if(site.placement==='level')for(const f of scenerySkirt(triangles,point,origin,groundY))tri(g,f.color,f.a,f.b,f.c);
  }
  compile(g);
  // Static water remains available in software and reduced-motion views.
  if(!software&&!reducedMotion.matches){
   for(const site of sites.filter(s=>s.scenery==='waterfall')){
    const flow=new THREE.Group();flow.name='water-flow';flow.userData.origin=fromGeo(site.center);
    for(const f of sceneryModule.waterTriangles(0))tri(flow,f.color,f.a,f.b,f.c);
    compile(flow);g.add(flow);
   }
  }
 }
 if(software)collectFaces();dirty=true;
}
function animateScenery(time){
 if(software||reducedMotion.matches||!groups.scenery?.visible)return;
 for(const flow of groups.scenery.children.filter(g=>g.name==='water-flow')){
  const batches=new Map();
  for(const f of sceneryModule.waterTriangles(time*.001)){
   if(!batches.has(f.color))batches.set(f.color,[]);
   batches.get(f.color).push(...f.a,...f.b,...f.c);
  }
  const origin=flow.userData.origin;
  for(const mesh of flow.children){
   const src=batches.get(mesh.userData.color),attr=mesh.geometry.attributes.position;
   if(!src||src.length!==attr.array.length)continue;
   for(let i=0;i<src.length;i+=3){const x=origin.x+src[i],z=origin.z+src[i+2];attr.array[i]=x;attr.array[i+1]=groundY({x,z})+.12+src[i+1];attr.array[i+2]=z;}
   attr.needsUpdate=true;mesh.geometry.computeBoundingSphere();
  }
  dirty=true;
 }
}
function collectFaces(){cpuFaces=[];root.updateMatrixWorld(true);root.traverse(mesh=>{if(!mesh.isMesh)return;const a=mesh.geometry.attributes.position.array,base=new THREE.Color(mesh.userData.color||'#cccccc');for(let i=0;i<a.length;i+=9){let p1=vector(a[i],a[i+1],a[i+2]),p2=vector(a[i+3],a[i+4],a[i+5]),p3=vector(a[i+6],a[i+7],a[i+8]);const normal=p2.clone().sub(p1).cross(p3.clone().sub(p1)).normalize();const light=.76+.24*Math.abs(normal.dot(vector(-.4,.8,.3).normalize()));const c=base.clone().multiplyScalar(light);let layer=mesh;while(layer.parent&&layer.parent!==root)layer=layer.parent;const maxY=Math.max(p1.y,p2.y,p3.y);let order=6;if(layer.name==='land')order=mesh.userData.color===colors.land?0:mesh.userData.color===colors.shore?1:2;else if(layer.name==='roads')order=roadPass(mesh.userData.color,colors);else if(layer.name==='roadSelection')order=5.5;else if(layer.name==='nature'&&maxY<.09)order=2;cpuFaces.push({mesh,a:p1,b:p2,c:p3,color:'#'+c.getHexString(),order});}});}
function visible(o){for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;}
function softwareRender(){const ctx=renderer.ctx,w=host.clientWidth,h=host.clientHeight;ctx.setTransform(renderer.ratio,0,0,renderer.ratio,0,0);ctx.fillStyle=colors.water;ctx.fillRect(0,0,w,h);scene.updateMatrixWorld(true);camera.updateMatrixWorld();const vp=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),cache=new Map(),list=[];for(const f of cpuFaces){if(!visible(f.mesh))continue;let matrix=cache.get(f.mesh);if(!matrix){matrix=new THREE.Matrix4().multiplyMatrices(vp,f.mesh.matrixWorld);cache.set(f.mesh,matrix)}const a=f.a.clone().applyMatrix4(matrix),b=f.b.clone().applyMatrix4(matrix),c=f.c.clone().applyMatrix4(matrix);if(Math.min(a.x,b.x,c.x)>1||Math.max(a.x,b.x,c.x)<-1||Math.min(a.y,b.y,c.y)>1||Math.max(a.y,b.y,c.y)<-1)continue;list.push({a,b,c,color:f.color,order:f.order,depth:(a.z+b.z+c.z)/3});}list.sort((a,b)=>a.order-b.order||b.depth-a.depth);for(const f of list){ctx.beginPath();ctx.moveTo((f.a.x+1)*w/2,(1-f.a.y)*h/2);ctx.lineTo((f.b.x+1)*w/2,(1-f.b.y)*h/2);ctx.lineTo((f.c.x+1)*w/2,(1-f.c.y)*h/2);ctx.closePath();ctx.fillStyle=f.color;ctx.fill();} }
function updateLabels(){camera.updateMatrixWorld();for(const m of markers){let p=m.position.clone();p.y=p.y+.9;p.project(camera);m.el.style.left=((p.x+1)*host.clientWidth/2)+'px';m.el.style.top=((1-p.y)*host.clientHeight/2)+'px';m.el.hidden=!$('labels-check').checked||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;}}
function resize(){roadTapVersion++;let aspect=host.clientWidth/host.clientHeight;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
 // Keep the on-road arrow below the mobile search rail, never fake its position.
 if(selectedRoad?.paths&&host.clientWidth<=600){const h=host.clientHeight,y=Math.min(h-100,Math.max(h/2,$('road-selection').getBoundingClientRect().bottom+80));camera.setViewOffset(host.clientWidth,h,0,h/2-y,host.clientWidth,h);}
 else camera.clearViewOffset();
 camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);dirty=true;}
function closeFocus(region) {
  let chosen=focusCache.get(region.id);
  if(!chosen){chosen=selectBuildingCluster(region,project);focusCache.set(region.id,chosen);}
  return vector(chosen.x,0,chosen.z);
}
function setCameraMode(mode) {
 cameraMode=mode;
 for(const id of ['close','district']){
   const btn=$(id+'-view');
   btn.classList.toggle('active',mode===id);
   btn.setAttribute('aria-pressed',String(mode===id));
 }
}
function pose(target,world=false,animate=true,mode='close'){roadTapVersion++;if(sun){sun.target.position.copy(target);sun.position.copy(target).add(vector(world?-1800:-90,world?6000:340,world?2700:130));sun.shadow.camera.left=world?-4200:-270;sun.shadow.camera.right=world?4200:270;sun.shadow.camera.top=world?4200:270;sun.shadow.camera.bottom=world?-4200:-270;sun.shadow.camera.updateProjectionMatrix();}topMode=false;$('top').classList.remove('active');$('top').setAttribute('aria-pressed','false');controls.enableRotate=true;controls.autoRotate=false;$('rotate').classList.remove('active');$('rotate').setAttribute('aria-pressed','false');setCameraMode(world?'overview':mode);const initial=view();span=world?7600:cameraSpan(current,mode);
 const aspect=host.clientWidth/host.clientHeight;if(world)span=Math.min(MAX_VIEW,Math.max(span,6000/aspect));else if(aspect<.8)span*=1.3;
 resize();controls.minZoom=span/MAX_VIEW;controls.maxZoom=span/MIN_VIEW;desiredView=null;anchor=null;setView(animate?initial:span);
 const pos=target.clone().add(world?vector(1700,7000,3900):mode==='building'?vector(24,48,40):vector(90,170,130));if(animate){animation={initial,end:span,start:performance.now(),from:camera.position.clone(),to:pos,fromTarget:controls.target.clone(),toTarget:target};}else{camera.position.copy(pos);controls.target.copy(target);controls.update();}dirty=true;}
function goRegion(id,animate=true){clearRoadSelection();dismissSearch();searchLocation=null;streetRequest?.abort();roamingRegion=null;roamGeneration++;roamKey='';const r=data.regions.find(r=>r.id===id);if(!r)return;demActive=false;buildWorld(r);$('region-tag').textContent=r.tag;$('region-name').innerHTML=r.name+'<span>.</span>';$('region-description').textContent=r.description;$('world-status').textContent='Building close-up · '+r.name;$('overview').classList.remove('active');document.querySelectorAll('.destination').forEach(b=>b.classList.toggle('active',b.dataset.region===id));pose(closeFocus(r),false,animate,'close');void requestElevation();}
function showBuilding(entry){selectedBuilding=entry;$('detail').hidden=false;$('building-name').textContent=entry.b.name||'Island rooftop';$('building-description').textContent=`Footprint from OpenStreetMap. ${entry.known?'Height based on a mapped height or level count.':'Height is an illustration; no usable height was recorded.'} Shown at ${heightScale}× height. Colours and rooftop details are decorative.`;$('building-link').href=`https://www.openstreetmap.org/way/${entry.b.id}`;}
function setTerrainStatus(text){$('terrain-status').textContent=text;}
async function requestElevation(){
 const token=++demToken;
 if(!$('terrain-enabled').checked){demActive=false;setTerrainStatus('Elevation off · flat map');buildWorld(roamingRegion??current,overviewMode);return;}
 setTerrainStatus('Loading island elevation…');
 try{
  // One bounded coarse island surface. Sharing it avoids cracks when streaming
  // streets and avoids downloading new DEM images on every camera movement.
  terrainLoad??=elevation.prime({minLon:57.25,maxLon:57.85,minLat:-20.55,maxLat:-19.95},10).then(result=>{
   if(!result.requested||result.received!==result.requested||!terrainMeshes)throw Error('DEM unavailable');
   surface=new TerrainSurface(terrainMeshes.overview,p=>elevation.sceneHeight(p));
  }).catch(e=>{terrainLoad=null;throw e;});
  await terrainLoad;if(token!==demToken)return;
  demActive=true;setTerrainStatus('Mapzen elevation · shared terrain');
 }catch{if(token!==demToken)return;demActive=false;setTerrainStatus('Flat fallback · DEM unavailable');}
 buildWorld(roamingRegion??current,overviewMode);dirty=true;
}
let roamingRegion=null, tileIndex;
let streetRequest=null;
const tileStore=new TileStore(async(key,signal)=>{
 const r=await fetch(assets+'tiles/'+key+'.json',{signal});
 if(!r.ok)throw Error('Tile unavailable');return r.json();
});
function viewportKeys(){
 camera.updateMatrixWorld();
 const points=[];
 const plane=new THREE.Plane(vector(0,1,0),-controls.target.y);
 for(const x of [-1,1])for(const y of [-1,1]){
  raycaster.setFromCamera(new THREE.Vector2(x,y),camera);
  const hit=raycaster.ray.intersectPlane(plane,new THREE.Vector3());
  if(!hit)return null;points.push(unproject(hit));
 }
 return visibleTileKeys({minLon:Math.min(...points.map(p=>p[0])),maxLon:Math.max(...points.map(p=>p[0])),
 minLat:Math.min(...points.map(p=>p[1])),maxLat:Math.max(...points.map(p=>p[1]))},tileIndex);
}
function localFrame(mode){pose(controls.target.clone(),false,true,mode);}
function freeLabel(wide){
 const island=wide&&view()>450;
 $('region-tag').textContent=searchLocation?.kind??'FREE EXPLORATION';$('region-name').textContent=searchLocation?.name??'Mauritius.';
 $('region-description').textContent=searchLocation?.description??'WASD to travel. Point and scroll to explore anywhere on the island.';
 $('world-status').textContent=island?'Island map':searchLocation?.scenery?'Illustrative landmark':'Mapped streets';$('overview').classList.toggle('active',island);
 document.querySelectorAll('.destination.active').forEach(b=>b.classList.remove('active'));
 setCameraMode(island?'overview':'free');
}
async function trackDetail(){
 const v=view(), p=controls.target;
 if(!tileIndex)return;
 const keys=v<=240?viewportKeys():null;
 if(v>(overviewMode?180:240)||keys===null){
   streetRequest?.abort();
   if(overviewMode&&roamKey){roamGeneration++;roamKey='';}
   if(!overviewMode){roamGeneration++;roamKey='';roamingRegion=null;demActive=false;demToken++;buildWorld(current,true);freeLabel(true);void requestElevation();}
   return;
 }
 const [lon,lat]=unproject(p);
 const lod=software||v>65?'simple':'detailed';
 const key=keys.join(',')+':'+lod;
 // Rotation often requests a subset of the current padded footprint. Keep its
 // meshes (and fresh terrain/style rebuilds) instead of rebuilding cached JSON.
 if(renderedStreet?.simple===(lod==='simple')&&renderedStreet.tileKeys&&keys.every(k=>renderedStreet.tileKeys.has(k))){
  if(streetRequest){streetRequest.abort();streetRequest=null;roamGeneration++;}
  roamKey=key;return;
 }
 if(roamKey===key&&streetRequest&&!streetRequest.signal.aborted)return;
 streetRequest?.abort();streetRequest=new AbortController();
 const request=streetRequest,signal=request.signal;
 roamKey=key;const token=++roamGeneration;
 try{
  const parts=await tileStore.read(keys,signal);if(token!==roamGeneration||signal.aborted)return;

  roamingRegion={id:'free',center:[lon,lat],roads:parts.flatMap(t=>t.roads),buildings:parts.flatMap(t=>t.buildings),parks:[],simple:lod==='simple',tileKeys:new Set(keys)};
  demActive=!!surface&&$('terrain-enabled').checked;setTerrainStatus(demActive?'Mapzen elevation · shared terrain':'Flat fallback · elevation off or unavailable');
  buildWorld(roamingRegion);freeLabel(false);
 }catch{if(token===roamGeneration&&!signal.aborted){roamKey='';$('world-status').textContent='Street data unavailable';lastCheck=performance.now()+3000;}}
 finally{if(streetRequest===request)streetRequest=null;}
}
let searchLocation=null;
let dismissSearch=()=>{};
function setupSearch(){
 let places=null,matches=[],placesLoading=null,queryVersion=0;
 const input=$('place-query'),results=$('place-results'),status=$('search-status');
 function closeResults(){queryVersion++;results.hidden=true;document.body.classList.remove('search-active');}
 dismissSearch=closeResults;
 function loadPlaces(){
  if(places)return Promise.resolve(true);
  if(!placesLoading){
   status.textContent='Loading place search…';
   placesLoading=fetch(assets+'places.json').then(r=>{if(!r.ok)throw Error();return r.json();})
    .then(d=>{places=withLandmarks(d.places);return true;})
    .catch(()=>{status.textContent='Place search unavailable. Focus or type to retry.';return false;})
    .finally(()=>{placesLoading=null;});
  }
  return placesLoading;
 }
 function choose(result){
  closeResults();
  if(result.type==='road'){void selectRoad(result.item);return;}
  clearRoadSelection();const place=result.item;
  searchLocation=place;streetRequest?.abort();roamGeneration++;roamKey='';roamingRegion=null;
  const target=fromGeo(place.center);target.y=groundY(target);
  pose(target,false,!matchMedia('(prefers-reduced-motion: reduce)').matches,'close');if(place.scenery&&animation)animation.end=place.view??75;input.value=place.name;
  $('region-name').textContent=place.name;$('region-description').textContent=place.description??'Explore the surrounding streets and landscape with WASD or the mouse.';
  $('region-tag').textContent=place.kind;status.textContent='Exploring '+place.name;
 }
 async function update(){
  const token=++queryVersion,q=input.value.trim();
  matches=[];results.replaceChildren();results.hidden=true;
  if(q.length<2){matches=[];results.replaceChildren();results.hidden=true;status.textContent='Type at least two characters';return;}
  document.body.classList.add('search-active');
  const [placesOK,roadsOK]=await Promise.all([loadPlaces(),loadRoadData(true)]);
  if(token!==queryVersion)return;
  const placeMatches=placesOK?searchPlaces(places,q).slice(0,5).map(item=>({type:'place',item})):[];
  const roadMatches=roadsOK?roadModule.searchRoads(roadIndex.roads,q,6).map(item=>({type:'road',item})):[];
  const normalizeName=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const query=normalizeName(q),rank=result=>{const name=normalizeName(result.item.name);return name===query?0:name.startsWith(query)?1:name.includes(query)?2:3;};
  matches=[...placeMatches,...roadMatches].sort((a,b)=>rank(a)-rank(b)).slice(0,8);
  results.replaceChildren();results.hidden=!matches.length;
  const unavailable=(!placesOK?'Place search unavailable. ':'')+(!roadsOK?'Road names unavailable. ':'');
  status.textContent=unavailable+(matches.length?matches.length+' matching roads and places':roadsOK?'No mapped match. Try a road name and nearby town.':'Try focusing or typing again to retry.');
  for(const result of matches){
   const item=result.item,li=document.createElement('li'),button=document.createElement('button');
   button.type='button';button.className='search-result';button.dataset.resultType=result.type;
   if(result.type==='road')button.dataset.roadId=item.id;
   const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('aria-hidden','true');
   const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',result.type==='road'?'m8 3-4 18m12-18 4 18M12 4v3m0 4v3m0 4v2':'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z');icon.append(shape);
   const copy=document.createElement('span'),name=document.createElement('strong'),location=document.createElement('small');name.textContent=item.name;
   let context=result.type==='road'?item.locality:item.kind+' · Place';
   if(result.type==='road'&&matches.filter(r=>r.type==='road'&&r.item.name===item.name&&r.item.locality===item.locality).length>1)context+=' · '+Math.abs(item.center[1]).toFixed(3)+'°S '+item.center[0].toFixed(3)+'°E · OSM '+item.wayIds[0];
   location.textContent=context;copy.append(name,location);button.append(icon,copy);button.onclick=()=>choose(result);li.append(button);results.append(li);
  }
 }
 input.addEventListener('input',update);
 input.addEventListener('focus',async()=>{
  if(places&&roadIndex)return;
  const token=++queryVersion;document.body.classList.add('search-active');
  const [placesOK]=await Promise.all([loadPlaces(),loadRoadData(true)]);
  if(placesOK&&token===queryVersion)void update();
 });
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&!results.hidden){e.preventDefault();results.querySelector('button')?.focus();}});
 results.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();});
 $('place-search-form').onsubmit=e=>{
  e.preventDefault();const query=input.value.trim().toLocaleLowerCase(),exact=matches.filter(result=>result.item.name.toLocaleLowerCase()===query);
  if(matches.length===1)choose(matches[0]);else if(exact.length===1)choose(exact[0]);else if(matches.length){status.textContent='Choose the road or place and its location below.';results.querySelector('button')?.focus();}
 };
 document.querySelector('.place-search').addEventListener('keydown',e=>{if(e.key==='Escape'){closeResults();input.focus();}});
 const slider=$('panel-transparency');
 function transparency(){document.documentElement.style.setProperty('--panel-alpha',panelAlpha(slider.value));$('transparency-value').value=slider.value+'%';}
 slider.oninput=transparency;transparency();
}

let drawWeather;
function setupInteraction(){
 drawWeather=mountWeather({toggle:$('weather-enabled'),status:$('weather-status'),canvas:$('weather-effects')});
 setupSearch();
 $('flow-enabled').disabled=!trafficToken;
 $('flow-enabled').onchange=updateTraffic;
 const tokenInput=$('traffic-token'),tokenStatus=$('traffic-token-status');
 tokenInput.value=trafficToken;
 if(trafficToken)tokenStatus.textContent='Build-time public token ready. Apply another to replace it for this page.';
 $('traffic-token-form').onsubmit=e=>{
  e.preventDefault();
  const value=tokenInput.value.trim(),token=normalizeTrafficToken(value);
  if(value&&!token){tokenInput.setAttribute('aria-invalid','true');tokenStatus.textContent='Not applied. Use a public pk. token, never a secret sk. token. The current token is unchanged.';return;}
  tokenInput.removeAttribute('aria-invalid');tokenInput.value=token;
  applyTrafficToken(token);
  tokenStatus.textContent=token?($('flow-enabled').checked?'Public token applied. Traffic refresh requested.':'Public token applied. Enable Mapbox traffic to test.'):'Token cleared for this page. Traffic is off.';
 };
 $('clear-traffic-token').onclick=()=>{
  tokenInput.value='';tokenInput.removeAttribute('aria-invalid');applyTrafficToken('');
  tokenStatus.textContent='Token cleared for this page. Traffic is off.';
 };
 $('clear-road').onclick=()=>{clearRoadSelection();$('search-status').textContent='Road selection cleared. Search another road or place.';};
 $('destinations').innerHTML=data.regions.map(r=>`<button class="destination" data-region="${r.id}"><span class="destination-icon">${r.icon}</span><span><strong>${r.name}</strong><small>${r.tag}</small></span></button>`).join('');document.querySelectorAll('.destination').forEach(b=>b.onclick=()=>goRegion(b.dataset.region));
 $('overview').onclick=()=>{clearRoadSelection();dismissSearch();streetRequest?.abort();roamingRegion=null;roamGeneration++;roamKey='';demActive=false;buildWorld(current,true);$('region-tag').textContent='ONE ISLAND. MANY LITTLE WORLDS.';$('region-name').innerHTML='Mauritius<span>.</span>';$('region-description').textContent='Point at any part of the island and scroll into its streets. This is the main island, shaped by OpenStreetMap.';$('world-status').textContent='The whole island';$('overview').classList.add('active');document.querySelectorAll('.destination').forEach(b=>b.classList.remove('active'));pose(fromGeo([57.565,-20.265]),true,true);void requestElevation();};
 $('reset').onclick=()=>roamingRegion?localFrame('close'):pose(overviewMode?fromGeo([57.565,-20.265]):cameraMode==='district'?fromGeo(current.center):closeFocus(current),overviewMode,true,overviewMode?'overview':cameraMode==='district'?'district':'close');
 $('close-view').onclick=()=>{if(overviewMode||roamingRegion){localFrame('close');return;}pose(closeFocus(current),false,true,'close');$('world-status').textContent='Building close-up · '+current.name;};
 $('district-view').onclick=()=>{if(overviewMode||roamingRegion){localFrame('district');return;}pose(fromGeo(current.center),false,true,'district');$('world-status').textContent='District view · '+current.name;};
 $('focus-building').onclick=()=>{if(!selectedBuilding)return;pose(vector(selectedBuilding.center.x,selectedBuilding.ground,selectedBuilding.center.z),false,true,'building');$('detail').hidden=true;$('world-status').textContent='Inspecting mapped building · '+current.name;};
 for(const [id,factor]of [['zoom-in',1.3],['zoom-out',1/1.3]])$(id).onclick=()=>{queueZoom(1/factor);};
 $('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').classList.toggle('active',controls.autoRotate);$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));dirty=true;};
 $('top').onclick=()=>{topMode=!topMode;controls.autoRotate=false;$('rotate').classList.remove('active');$('rotate').setAttribute('aria-pressed','false');$('top').classList.toggle('active',topMode);$('top').setAttribute('aria-pressed',String(topMode));controls.enableRotate=!topMode;const target=controls.target.clone();camera.position.copy(target).add(topMode?vector(0,overviewMode?7000:230,.01):vector(overviewMode?1700:90,overviewMode?7000:170,overviewMode?3900:130));controls.update();dirty=true;};
 const setLayers=open=>{
  $('layers-panel').hidden=!open;$('layers-button').setAttribute('aria-expanded',String(open));
  (open?$('close-layers'):$('layers-button')).focus();
 };
 $('layers-button').onclick=()=>setLayers($('layers-panel').hidden);
 $('close-layers').onclick=()=>setLayers(false);
 document.querySelectorAll('[data-layer]').forEach(input=>input.onchange=()=>{groups[input.dataset.layer].visible=input.checked;dirty=true;});$('labels-check').onchange=()=>dirty=true;$('height').oninput=()=>{heightScale=+$('height').value;$('height-value').value=heightScale+'×';buildWorld(roamingRegion??current,overviewMode);dirty=true;};
 $('theme').onchange=()=>{themeId=$('theme').value;Object.assign(colors,THEMES[themeId]);scene.background.set(colors.water);buildWorld(roamingRegion??current,overviewMode);dirty=true;};
 $('terrain-enabled').onchange=()=>{void requestElevation();};
 $('help').onclick=$('credits-button').onclick=()=>$('about').showModal();$('close-about').onclick=()=>$('about').close();$('about').onclick=e=>{if(e.target===$('about'))$('about').close()};$('close-detail').onclick=()=>$('detail').hidden=true;
 let down;
 renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||roadDragging)return;const box=renderer.domElement.getBoundingClientRect();roadPointer={x:e.clientX-box.left,y:e.clientY-box.top};});
 renderer.domElement.addEventListener('pointerleave',()=>clearRoadHover());
 renderer.domElement.addEventListener('pointercancel',()=>{roadTapVersion++;down=null;roadDragging=false;clearRoadHover();});
 renderer.domElement.addEventListener('pointerdown',e=>{roadTapVersion++;down=[e.clientX,e.clientY];clearRoadHover();dismissSearch();});
 renderer.domElement.addEventListener('pointerup',async e=>{
  roadDragging=false;
  const click=down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<=5;down=null;
  if(!click||overviewMode)return;
  const box=renderer.domElement.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;
  pointer.set(x/host.clientWidth*2-1,1-y/host.clientHeight*2);raycaster.setFromCamera(pointer,camera);root.updateMatrixWorld(true);
  const hits=groups.buildings.visible?raycaster.intersectObjects(groups.buildings.children,false):[];
  if(hits.length){const hit=hits[0].point,b=buildingHits.find(b=>inPolygon(hit,b.points));if(b)showBuilding(b);return;}
  const token=++roadTapVersion;
  if(await loadRoadData(true)){if(token!==roadTapVersion)return;const hit=pickVisibleRoad(x,y,e.pointerType==='touch'?20:8,true);if(hit)void selectRoad(hit.road);}
 });

 window.addEventListener('resize',resize);document.addEventListener('keydown',e=>{if(e.key==='Escape'){clearRoadSelection();$('detail').hidden=true;if(!$('layers-panel').hidden)setLayers(false);controls.autoRotate=false;}if(e.key.toLowerCase()==='r'&&!$('about').open&&!e.target.closest?.('input,textarea,select,[contenteditable=true]'))$('reset').click();});
}
function animateCars(time){
 if(!groups.traffic?.visible||overviewMode||time===lastCarTime)return;
 lastCarTime=time;
 for(const car of cars){
  const t=(time*.001*car.speed+car.offset)%1;
  const p=car.curve.getPoint(t,carPoint),tangent=car.curve.getTangent(t,carTangent);
  car.g.position.set(p.x+tangent.z*car.lane,0,p.z-tangent.x*car.lane);
  car.g.position.y=groundY(car.g.position)+.056;car.g.rotation.y=Math.atan2(tangent.x,tangent.z);
 }
 if(cars.length)dirty=true;
}
function followSun(){
 if(!sun)return;
 const shadow=sun.shadow.camera;
 const far=Math.max(1700,sun.position.distanceTo(sun.target.position)+Math.max(Math.abs(shadow.left),Math.abs(shadow.right),Math.abs(shadow.top),Math.abs(shadow.bottom)));
 if(shadow.far!==far){shadow.far=far;shadow.updateProjectionMatrix();dirty=true;}
 sunShift.copy(controls.target).sub(sun.target.position);
 if(sunShift.lengthSq()===0)return;
 sun.position.add(sunShift);sun.target.position.copy(controls.target);dirty=true;
}
function tick(time){requestAnimationFrame(tick);if(document.hidden){previousFrame=null;return;}const delta=previousFrame===null?0:Math.min(Math.max((time-previousFrame)/1000,0),.08);previousFrame=time;if(!reducedMotion.matches)motionTime+=delta*1000;if(animation){const t=Math.min((time-animation.start)/750,1),ease=1-(1-t)**3;setView(animation.initial*(animation.end/animation.initial)**ease);camera.position.lerpVectors(animation.from,animation.to,ease);controls.target.lerpVectors(animation.fromTarget,animation.toTarget,ease);if(t===1)animation=null;dirty=true;}
 if(desiredView!==null){
   const before=view(),next=desiredView*(before/desiredView)**Math.exp(-15*delta);
   const done=Math.abs(Math.log(next/desiredView))<.0003;setView(done?desiredView:next);
   if(anchor){const shift=anchor.clone().sub(controls.target).multiplyScalar(1-view()/before);camera.position.add(shift);controls.target.add(shift);}
   if(done){desiredView=null;anchor=null;}
 }
 if(held.size){const dx=Number(held.has('d'))-Number(held.has('a')), dz=Number(held.has('s'))-Number(held.has('w'));
   const a=controls.getAzimuthalAngle(), step=view()*delta*.85/(Math.hypot(dx,dz)||1);
   const shift=vector(dx*Math.cos(a)+dz*Math.sin(a),0,-dx*Math.sin(a)+dz*Math.cos(a)).multiplyScalar(step);
   camera.position.add(shift);controls.target.add(shift);anchor=null;dirty=true;
 }
 if(!animation){
  const h=groundY(controls.target),dy=(h-controls.target.y)*(1-Math.exp(-8*delta));
  controls.target.y+=dy;camera.position.y+=dy;if(Math.abs(dy)>.0001)dirty=true;
 }
 controls.update(delta);
 followSun();
 // Screen-space consumers run before renderer.render refreshes camera matrices.
 camera.updateMatrixWorld();updateRoadHover(time);
 if(dirty||controls.autoRotate)updateRoadLocator();
 if(!animation&&time-lastCheck>160){lastCheck=time;trackDetail();updateScenery();updateTraffic();}
 if(groups.scenery)groups.scenery.visible=groups.nature?.visible??true;
 if(software&&time-lastRender<50)return;
 animateCars(motionTime);animateScenery(motionTime);
 drawWeather?.({time,camera,target:controls.target,wide:view()>450,ground:groundY,terrain:demActive?surface:null});
 if(dirty||controls.autoRotate){if(software)softwareRender();else renderer.render(scene,camera);updateLabels();dirty=false;}lastRender=time;
}
async function init(){try{
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.setClearColor(colors.water);}catch(error){software=true;const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser cannot create a drawing canvas.');renderer={domElement:canvas,ctx,ratio:Math.min(devicePixelRatio,1.25),setSize(w,h){canvas.width=w*this.ratio;canvas.height=h*this.ratio;canvas.style.width=w+'px';canvas.style.height=h+'px';}};$('renderer-status').textContent='Three.js · software view';}
 renderer.domElement.setAttribute('aria-label','Explore Mauritius: WASD to move, drag to rotate, point and scroll to zoom');renderer.domElement.tabIndex=0;host.append(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.screenSpacePanning=false;controls.maxPolarAngle=Math.PI*.43;controls.minPolarAngle=.001;controls.minZoom=.35;controls.maxZoom=18;controls.autoRotateSpeed=.4;controls.addEventListener('change',()=>{roadTapVersion++;dirty=true;});controls.addEventListener('start',()=>{roadTapVersion++;animation=null;desiredView=null;anchor=null;roadDragging=true;clearRoadHover();});controls.addEventListener('end',()=>{roadDragging=false;});
 renderer.domElement.addEventListener('wheel',e=>{
   e.preventDefault();e.stopImmediatePropagation();
   const box=renderer.domElement.getBoundingClientRect();
   pointer.set((e.clientX-box.left)/box.width*2-1,1-(e.clientY-box.top)/box.height*2);
   raycaster.setFromCamera(pointer,camera);
   const hit=raycaster.ray.intersectPlane(new THREE.Plane(vector(0,1,0),-controls.target.y),new THREE.Vector3());
   queueZoom(Math.exp(THREE.MathUtils.clamp(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?box.height:1)*.0025,-1,1)),hit);
 },{capture:true,passive:false});
 document.addEventListener('keydown',e=>{
   if(!/^[wasd]$/i.test(e.key)||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,select,textarea,[contenteditable=true]')||$('about').open)return;
   e.preventDefault();animation=null;held.add(e.key.toLowerCase());
 });
 document.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));
 window.addEventListener('blur',()=>held.clear());
 document.addEventListener('visibilitychange',()=>{previousFrame=null;held.clear();clearRoadHover();updateTraffic();});
 scene.add(new THREE.HemisphereLight('#fffbe6','#7d8f6a',1.9));sun=new THREE.DirectionalLight('#fff7d7',2.0);sun.position.set(-100,250,140);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-280;sun.shadow.camera.right=280;sun.shadow.camera.top=280;sun.shadow.camera.bottom=-280;sun.shadow.camera.near=1;sun.shadow.camera.far=1700;sun.shadow.bias=-.0003;scene.add(sun);scene.add(sun.target);
 const response=await fetch(assets+'mauritius-osm.json');if(!response.ok)throw new Error('The OpenStreetMap dataset could not be loaded. Please reload.');data=await response.json();
 try{const terrainResponse=await fetch(assets+'terrain-mesh.json');terrainMeshes=terrainResponse.ok?await terrainResponse.json():null;}catch(error){terrainMeshes=null;}
 tileIndex=new Set((await (await fetch(assets+'tiles/index.json')).json()).keys);setupInteraction();goRegion('port-louis',false);$('world-status').textContent='Building close-up · Port Louis';$('loading').hidden=true;requestAnimationFrame(tick);
 }catch(e){$('loading').hidden=true;$('error').hidden=false;$('error-message').textContent=e.message;console.error(e);}}
init();

// Hot-swap only the pure helper; scene-entry edits need Vite's safe full reload.
if(import.meta.hot){
 import.meta.hot.accept('./roads.js',module=>{
  if(!module){import.meta.hot.invalidate('Road helper update failed');return;}
  roadModule=module;
  if(roadIndex&&!$('place-results').hidden)$('place-query').dispatchEvent(new Event('input'));
  dirty=true;
 });
}

// Supported smoke-test state, separate from geographic accuracy claims.
window.__MU_TEST__=(includeRoadSamples=false)=>({roadIndexReady:!!roadIndex,roadCount:roadIndex?.roads.length??0,roadHover:roadHover?.id??null,roadSelection:selectedRoad?{id:selectedRoad.road.id,name:selectedRoad.road.name,ready:!!selectedRoad.paths,wayIds:selectedRoad.road.wayIds}:null,roadMeshes:groups.roadSelection?.children.length??0,roadGeometryBuckets:roadGeometryCache.size,roadSamples:includeRoadSamples&&roadIndex?screenRoads().flatMap(r=>r.points.slice(1).map((b,i)=>({wayId:r.wayId,id:roadsByWay.get(r.wayId)?.id,x:(r.points[i].x+b.x)/2,y:(r.points[i].y+b.y)/2}))).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>340&&p.x<host.clientWidth-90&&p.y>110&&p.y<host.clientHeight-170).slice(0,100):undefined,trafficKey,trafficLines:trafficLines.length,trafficMeshes:groups.flow?.children.length??0,trafficVertices:groups.flow?.children.reduce((n,m)=>n+m.geometry.attributes.position.count,0)??0,sceneryVisible:groups.scenery?.visible??false,scenery:groups.scenery?.userData.sites??[],sceneryMeshes:groups.scenery?.children.length??0,region:current?.id||null,overview:overviewMode,view:view(),target:controls?.target.toArray(),roamKey,cachedTiles:tileStore.cache.size,dem:demActive,theme:themeId,cameraMode,span,zoom:camera.zoom,focus:current?focusCache.get(current.id):null,buildingHits:buildingHits.length,roads:overviewMode?data.mainRoads.length:(roamingRegion??current)?.roads.length||0,software});
