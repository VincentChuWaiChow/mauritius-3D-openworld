import {createMarineLayer} from './marine.js';
import {project} from './geo.js';

// Loaded only after layer/search intent. No provider requests or extra frame loop.
export function mountMarine({scene,software,ground,waterColor=()=>undefined,toggle,details,status,waveButton,reducedMotion,url,onChange,fetcher=fetch}){
 let dataset=null,loading=null,layer=null,enabled=false,waves=true,generation=0,surfaceKey='',destroyed=false;
 const request=new AbortController();
 async function load(){
  if(dataset)return dataset;
  if(!loading)loading=fetcher(url,{signal:request.signal}).then(async response=>{
   if(!response.ok)throw Error('Marine data unavailable');
   const value=await response.json();
   if(value.version!==1||!Array.isArray(value.features)||!value.features.length)throw Error('Invalid marine data');
   dataset=value;return dataset;
  }).finally(()=>{loading=null;});
  return loading;
 }
 function syncMotion(){
  const animate=waves&&!software&&!reducedMotion.matches;
  layer?.setWaves(animate);waveButton.disabled=software||reducedMotion.matches;
  waveButton.setAttribute('aria-pressed',String(animate));
  waveButton.textContent=software?'Static waves · software view':reducedMotion.matches?'Static waves · reduced motion':waves?'Pause waves':'Animate waves';
  onChange();
 }
 function release(){layer?.dispose();layer=null;}
 function create(){
  release();layer=createMarineLayer(dataset,{software,ground,waterColor:waterColor()});scene.add(layer.group);syncMotion();
  const reefs=dataset.features.filter(f=>f.kind==='reef').length,lagoons=dataset.features.filter(f=>f.kind==='lagoon').length;
  status.textContent=`${reefs} mapped reef${reefs===1?'':'s'} · ${lagoons} lagoon${lagoons===1?'':'s'}. Partial coverage.`;
  onChange();
 }
 async function setEnabled(value){
  if(destroyed)return false;
  if(value&&enabled&&layer)return true;
  enabled=!!value;toggle.checked=enabled;const token=++generation;
  details.hidden=!enabled;
  if(!enabled){release();status.textContent='';onChange();return false;}
  status.textContent='Loading mapped reefs and lagoons…';
  try{
   await load();if(token!==generation||!enabled||destroyed)return false;
   create();return true;
  }catch{
   if(token===generation&&enabled&&!destroyed){dataset=null;status.textContent='Marine data unavailable. Toggle off and on to retry.';onChange();}
   return false;
  }
 }
 async function loadPlaces(){
  const data=await load();
  return data.features.map(feature=>{
   const [x,y,X,Y]=feature.bounds,center=project(feature.center);
   const radius=Math.max(...[[x,y],[x,Y],[X,y],[X,Y]].map(p=>{const q=project(p);return Math.hypot(q.x-center.x,q.z-center.z);}));
   const coral=feature.kind==='reef'&&feature.reefType==='coral';
   const kind=feature.kind==='reef'?(coral?'Coral reef':'Mapped reef'):'Lagoon';
   return {...feature,kind,marine:true,view:Math.max(20,radius*2.4),
    aliases:(feature.kind==='reef'?(coral?'coral reef reefs recif récif coraux':'reef reefs recif récif'):'lagoon lagoons lagon lagons')+' '+feature.id,
    description:`${kind} mapped in OpenStreetMap. ${feature.generatedLabel?'This is an approximate nearby-place label, not an official name. ':''}Coverage is partial; no coral-health assessment. Waves are illustrative, not live sea conditions.`};
  });
 }
 waveButton.onclick=()=>{if(waveButton.disabled)return;waves=!waves;syncMotion();};
 reducedMotion.addEventListener('change',syncMotion);syncMotion();
 return {
  get group(){return layer?.group??null;},setEnabled,loadPlaces,
  tick(seconds,view){return enabled&&layer?layer.tick(seconds,view,waves&&!software&&!reducedMotion.matches):false;},
  refreshSurface(key){if(key===surfaceKey)return;surfaceKey=key;if(layer)create();},
  stats(){return {...layer?.stats(),enabled,loaded:!!dataset,featureCount:dataset?.features.length??0,wavesEnabled:waves};},
  dispose(){if(destroyed)return;destroyed=true;generation++;enabled=false;request.abort();release();reducedMotion.removeEventListener('change',syncMotion);waveButton.onclick=null;onChange();},
 };
}
