import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {readFileSync} from 'node:fs';
import {project} from '../src/explorer/geo.js';
import {searchPlaces} from '../src/explorer/search.js';
import {mountMarine} from '../src/explorer/marine-controls.js';

const dataset={version:1,features:[{id:'w1',kind:'reef',name:'Blue Bay Riff',generatedLabel:false,center:[57.71,-20.44],bounds:[57.7,-20.45,57.72,-20.43],sourceUrl:'https://www.openstreetmap.org/way/1',geometry:{type:'Polygon',coordinates:[[[57.7,-20.45],[57.72,-20.45],[57.72,-20.43],[57.7,-20.43],[57.7,-20.45]]]}},{id:'w2',kind:'lagoon',name:'Lagoon near Anse la Raie',generatedLabel:true,center:[57.63,-19.99],bounds:[57.62,-20,57.64,-19.98],sourceUrl:'https://www.openstreetmap.org/way/2',geometry:{type:'Polygon',coordinates:[[[57.62,-20],[57.64,-20],[57.64,-19.98],[57.62,-19.98],[57.62,-20]]]}}]};
function harness(fetcher=async()=>({ok:true,json:async()=>structuredClone(dataset)})){
 const scene=new Group(),toggle={checked:false},details={hidden:true},status={textContent:''};
 const waveButton={disabled:false,textContent:'',setAttribute(k,v){this[k]=v;}};
 const reducedMotion={matches:false,addEventListener(_k,fn){this.change=fn;},removeEventListener(){this.change=null;}};
 let calls=0,changes=0;
 const marine=mountMarine({scene,software:false,ground:()=>0,toggle,details,status,waveButton,reducedMotion,url:'/marine/index.json',fetcher:(...a)=>{calls++;return fetcher(...a);},onChange(){changes++;}});
 return {scene,toggle,details,status,waveButton,reducedMotion,marine,calls:()=>calls,changes:()=>changes};
}
test('marine loading is intent-only, cached for search, and maps names without mutating data',async()=>{
 const h=harness();assert.equal(h.calls(),0);assert.equal(h.scene.children.length,0);
 const places=await h.marine.loadPlaces();assert.equal(h.calls(),1);assert.equal(h.scene.children.length,0);
 assert.deepEqual(places.map(p=>p.kind),['Mapped reef','Lagoon']);assert.ok(places.every(p=>p.marine&&p.view>=20));
 assert.match(places[1].description,/approximate/i);assert.match(places[0].description,/illustrative/i);
 await h.marine.setEnabled(true);assert.equal(h.calls(),1);assert.equal(h.scene.children.length,1);assert.equal(h.details.hidden,false);
 assert.match(h.status.textContent,/1 mapped reef.*1 lagoon/);h.marine.dispose();assert.equal(h.scene.children.length,0);
});
test('disabled pending loads cannot resurrect a marine scene',async()=>{
 let release;const h=harness(()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>structuredClone(dataset)});}));
 const pending=h.marine.setEnabled(true);await h.marine.setEnabled(false);release();await pending;
 assert.equal(h.scene.children.length,0);assert.equal(h.marine.group,null);assert.equal(h.details.hidden,true);
 await h.marine.setEnabled(true);assert.equal(h.calls(),1);assert.equal(h.scene.children.length,1);h.marine.dispose();
});
test('marine network failure reports recovery and retries without poisoning ordinary search',async()=>{
 let fail=true;const h=harness(async()=>{if(fail)return {ok:false};return {ok:true,json:async()=>structuredClone(dataset)};});
 assert.equal(await h.marine.setEnabled(true),false);assert.match(h.status.textContent,/unavailable.*retry/i);assert.equal(h.scene.children.length,0);
 fail=false;await h.marine.setEnabled(false);assert.equal(await h.marine.setEnabled(true),true);assert.equal(h.calls(),2);h.marine.dispose();
});
test('malformed successful data can be retried, rather than poisoning the cache',async()=>{
 let bad=true;const h=harness(async()=>({ok:true,json:async()=>bad?{version:1,features:[{kind:'reef',geometry:{type:'Polygon',coordinates:[]}}]}:structuredClone(dataset)}));
 assert.equal(await h.marine.setEnabled(true),false);assert.equal(h.scene.children.length,0);
 bad=false;await h.marine.setEnabled(false);assert.equal(await h.marine.setEnabled(true),true);assert.equal(h.calls(),2);h.marine.dispose();
});
test('only source-tagged coral reefs receive coral classification and search aliases',async()=>{
 const value=structuredClone(dataset);value.features.push({...value.features[0],id:'w3',name:'Tagged reef',reefType:'coral'});
 const h=harness(async()=>({ok:true,json:async()=>value}));const places=await h.marine.loadPlaces();
 assert.equal(places[0].kind,'Mapped reef');assert.doesNotMatch(places[0].aliases,/coral/);
 assert.equal(places[2].kind,'Coral reef');assert.match(places[2].aliases,/coral/);h.marine.dispose();
});
test('all actual marine features frame their full extent around the interior anchor, including large reefs',async()=>{
 const data=JSON.parse(readFileSync(new URL('../public/explorer/marine/index.json',import.meta.url),'utf8'));
 const h=harness(async()=>({ok:true,json:async()=>data}));const places=await h.marine.loadPlaces();
 for(const place of places){const [x,y,X,Y]=place.bounds,c=project(place.center);
  const radius=Math.max(...[[x,y],[x,Y],[X,y],[X,Y]].map(p=>{const q=project(p);return Math.hypot(q.x-c.x,q.z-c.z);}));
  assert.ok(place.view>=radius*2.3,'Full feature extent must fit, not an arbitrary 900-unit crop: '+place.id);
  assert.ok(searchPlaces(places,place.id).some(p=>p.id===place.id),'Every location remains searchable when generated names repeat: '+place.id);
 }h.marine.dispose();
});
test('pause, reduced motion, and surface changes keep exactly one owned scene',async()=>{
 const h=harness();await h.marine.setEnabled(true);h.marine.tick(1,100);h.marine.tick(2,100);
 h.waveButton.onclick();const paused=h.marine.stats().waveTime;h.marine.tick(4,100);assert.equal(h.marine.stats().waveTime,paused);
 assert.equal(h.waveButton['aria-pressed'],'false');h.waveButton.onclick();h.marine.tick(5,100);
 h.reducedMotion.matches=true;h.reducedMotion.change();const stopped=h.marine.stats().waveTime;h.marine.tick(9,100);assert.equal(h.marine.stats().waveTime,stopped);assert.equal(h.waveButton.disabled,true);
 const before=h.marine.group;h.marine.refreshSurface('new terrain');assert.notEqual(h.marine.group,before);assert.equal(h.scene.children.length,1);
 const same=h.marine.group;h.marine.refreshSurface('new terrain');assert.equal(h.marine.group,same);h.marine.dispose();h.marine.dispose();assert.equal(h.scene.children.length,0);
});
