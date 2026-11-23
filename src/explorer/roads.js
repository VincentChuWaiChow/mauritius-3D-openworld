import {normalize} from './search.js';

const words=value=>typeof value==='string'?normalize(value).split(' ').filter(Boolean):[];
const compare=(a,b)=>a<b?-1:a>b?1:0;
const matches=(tokens,terms)=>tokens.every(token=>terms.some(term=>term.startsWith(token)));

export function searchRoads(roads,query,limit=6){
  if(!Array.isArray(roads)||typeof query!=='string'||!Number.isFinite(limit)||limit<1)return [];
  const q=normalize(query);
  if(q.length<2)return [];
  const tokens=q.split(' '),results=[];
  for(let index=0;index<roads.length;index++){
    const road=roads[index];
    if(!road||typeof road.name!=='string')continue;
    const name=normalize(road.name),nameWords=words(road.name);
    if(!name)continue;
    const aliases=words(road.aliases),locality=words(road.locality),named=[...nameWords,...aliases];
    if(!matches(tokens,[...named,...locality]))continue;
    const rank=name===q?0:name.startsWith(q)?1:matches(tokens,nameWords)?2:
      matches(tokens,named)?3:tokens.some(token=>named.some(term=>term.startsWith(token)))?4:5;
    results.push({road,rank,name,locality:locality.join(' '),id:String(road.id??''),index});
  }
  return results.sort((a,b)=>a.rank-b.rank||compare(a.name,b.name)||compare(a.locality,b.locality)||
    compare(a.id,b.id)||a.index-b.index).slice(0,Math.floor(limit)).map(result=>result.road);
}

const finitePoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const validWayId=id=>(typeof id==='number'&&Number.isFinite(id))||(typeof id==='string'&&id.trim().length>0);
const compareWayId=(a,b)=>typeof a==='number'&&typeof b==='number'?compare(a,b):compare(String(a),String(b));

export function pickRoad(paths,point,maxDistance=8){
  if(!Array.isArray(paths)||!finitePoint(point)||!Number.isFinite(maxDistance)||maxDistance<0)return null;
  let best=null;
  for(const path of paths){
    if(!path||!validWayId(path.wayId)||!Array.isArray(path.points))continue;
    for(let segment=0;segment<path.points.length-1;segment++){
      const a=path.points[segment],b=path.points[segment+1];
      if(!finitePoint(a)||!finitePoint(b))continue;
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      if(!Number.isFinite(length)||length===0)continue;
      const t=Math.max(0,Math.min(1,((point.x-a.x)/length)*(dx/length)+((point.y-a.y)/length)*(dy/length)));
      const closest={x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t};
      const distance=Math.hypot(point.x-closest.x,point.y-closest.y);
      if(!Number.isFinite(distance)||distance>maxDistance)continue;
      if(!best||distance<best.distance||(distance===best.distance&&
        (compareWayId(path.wayId,best.wayId)<0||(compareWayId(path.wayId,best.wayId)===0&&segment<best.segment)))){
        best={wayId:path.wayId,point:closest,distance,segment,t};
      }
    }
  }
  return best;
}

const geographicPoint=point=>Array.isArray(point)&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&
  Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
const geographicLength=(a,b)=>Math.hypot((b[0]-a[0])*Math.cos((a[1]+b[1])*Math.PI/360),b[1]-a[1]);

export function pathAnchor(paths){
  if(!Array.isArray(paths))return null;
  let bestLength=0,best=null;
  for(const path of paths){
    if(!Array.isArray(path))continue;
    let previous=null,length=0,segments=[];
    const finish=()=>{
      if(length>bestLength){bestLength=length;best=segments;}
      previous=null;length=0;segments=[];
    };
    for(const point of path){
      // An invalid vertex splits the path; never connect its neighbours.
      if(!geographicPoint(point)){finish();continue;}
      if(previous){
        const distance=geographicLength(previous,point);
        if(distance>0){segments.push({a:previous,b:point,length:distance});length+=distance;}
      }
      previous=point;
    }
    finish();
  }
  if(!best)return null;
  let remaining=bestLength/2;
  for(const segment of best){
    if(remaining<=segment.length){
      const t=remaining/segment.length;
      return [segment.a[0]*(1-t)+segment.b[0]*t,segment.a[1]*(1-t)+segment.b[1]*t];
    }
    remaining-=segment.length;
  }
  return best.at(-1).b.slice(0,2);
}
