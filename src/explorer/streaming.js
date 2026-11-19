// Small LRU of decoded tiles; requests are bounded independently from cache size.
export class TileStore {
 constructor(load,limit=48){this.load=load;this.limit=limit;this.cache=new Map();}
 async get(key,signal){
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(this.cache.has(key)){const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);return value;}
  const value=await this.load(key,signal);
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  this.cache.set(key,value);
  while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);
  return value;
 }
 async read(keys,signal){
  let cursor=0;const result=new Array(keys.length);
  await Promise.all(Array.from({length:Math.min(4,keys.length)},async()=>{
   while(cursor<keys.length){const i=cursor++;result[i]=await this.get(keys[i],signal);}
  }));
  return result;
 }
}
export function visibleTileKeys(bounds,index){
 const minX=Math.floor((bounds.minLon-57)*200)-1,maxX=Math.floor((bounds.maxLon-57)*200)+1;
 const minY=Math.floor((bounds.minLat+21)*200)-1,maxY=Math.floor((bounds.maxLat+21)*200)+1;
 // Near-horizon views can cover the entire island. Use overview rather than
 // attempting an unbounded street mesh or silently dropping random buildings.
 if((maxX-minX+1)*(maxY-minY+1)>100)return null;
 const keys=[];
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)if(index.has(x+'_'+y))keys.push(x+'_'+y);
 return keys;
}
