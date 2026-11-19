import { project, unproject, METERS_PER_WORLD_UNIT } from './geo.js';
export const TERRARIUM_TEMPLATE='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export function decodeTerrarium(r,g,b){return r*256+g+b/256-32768;}
const rad=Math.PI/180;
export function tileXY([lon,lat],z){
  const n=2**z;
  return [(lon+180)/360*n,(1-Math.asinh(Math.tan(Math.max(-85.05112878,Math.min(85.05112878,lat))*rad))/Math.PI)/2*n];
}
function urlFor(z,x,y){return TERRARIUM_TEMPLATE.replace('{z}',z).replace('{x}',x).replace('{y}',y);}
async function loadImageTile(z,x,y){
  const img = new Image(); img.crossOrigin='anonymous';
  return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{img.src='';reject(new Error('DEM tile timeout'));},6500);
    img.onload=()=>{clearTimeout(timer);try{
      const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      resolve({w:c.width,h:c.height,rgba:ctx.getImageData(0,0,c.width,c.height).data});
    }catch(e){reject(e)}};
    img.onerror=()=>{clearTimeout(timer);reject(new Error('DEM tile unavailable'))};
    img.src=urlFor(z,x,y);
  });
}
/** Cache only viewed-island DEM parents, never cache OSM raster maps. */
export class TerrainCache {
 constructor(){this.data=new Map();this.pending=new Map();this.zoom=10;this.available=false;}
 key(z,x,y){return `${z}/${x}/${y}`;}
 async get(z,x,y){const key=this.key(z,x,y);if(this.data.has(key))return this.data.get(key);
  if(this.pending.has(key))return this.pending.get(key);
  const task=loadImageTile(z,x,y).catch(()=>null).then(tile=>{this.pending.delete(key);if(tile)this.data.set(key,tile);while(this.data.size>24)this.data.delete(this.data.keys().next().value);if(tile)this.available=true;return tile;});
  this.pending.set(key,task);return task;
 }
 async prime(bounds,zoom=10){this.zoom=zoom;
  const nw=tileXY([bounds.minLon,bounds.maxLat],zoom),se=tileXY([bounds.maxLon,bounds.minLat],zoom);
  const tiles=[];for(let x=Math.floor(nw[0]);x<=Math.floor(se[0]);x++)for(let y=Math.floor(nw[1]);y<=Math.floor(se[1]);y++)tiles.push([x,y]);
  // Deliberate bounded, user-triggered region requests; no bulk global prefetch.
  if(tiles.length>24)throw new Error('Terrain request exceeds viewport allowance');
  let ok=0;let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,tiles.length)},async()=>{
    while(cursor<tiles.length){const [x,y]=tiles[cursor++];if(await this.get(zoom,x,y))ok++;}
  }));
  return {available:ok>0,received:ok,requested:tiles.length};
 }
 sample(lon,lat,z=this.zoom){const t=tileXY([lon,lat],z),x=Math.floor(t[0]),y=Math.floor(t[1]);const tile=this.data.get(this.key(z,x,y));if(!tile)return 0;
  const px=Math.min(tile.w-1,Math.max(0,(t[0]-x)*tile.w-.5)),py=Math.min(tile.h-1,Math.max(0,(t[1]-y)*tile.h-.5));
  const x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(x0+1,tile.w-1),y1=Math.min(y0+1,tile.h-1);
  const read=(i,j)=>{const idx=(j*tile.w+i)*4;return decodeTerrarium(tile.rgba[idx],tile.rgba[idx+1],tile.rgba[idx+2]);};
  const sx=px-x0,sy=py-y0;
  const top=read(x0,y0)*(1-sx)+read(x1,y0)*sx;
  const bottom=read(x0,y1)*(1-sx)+read(x1,y1)*sx;
  return Math.max(0,Math.min(1400,top*(1-sy)+bottom*sy));
 }
 sceneHeight(point){const [lon,lat]=unproject(point);return this.sample(lon,lat)/METERS_PER_WORLD_UNIT;}
}
/** Build real-data-aligned terrain from OSM-clipped triangles. */
export function buildTerrainGeometry(THREE, mesh, elevation, palette) {
 const geometry=new THREE.BufferGeometry(), positions=[],colors=[];
 for(const tri of mesh.triangles){
  for(const pt of tri){const elev=elevation?elevation.sceneHeight({x:pt[0],z:pt[1]}):0;
   positions.push(pt[0],elev,pt[1]);
   let color=palette.land;
   if(elev>.5&&elev<3)color=palette.inland;
   if(elev>13)color=palette.ridge;
   if(elev>42)color=palette.highland;
   if(elev<.2)color=palette.land;
   const cc=new THREE.Color(color);colors.push(cc.r,cc.g,cc.b);
  }
 }
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();return geometry;
}
