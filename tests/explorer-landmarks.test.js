import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANDMARKS,withLandmarks,nearbyLandmarks} from '../src/explorer/landmarks.js';
import {searchPlaces} from '../src/explorer/search.js';
import {project} from '../src/explorer/geo.js';
const places=withLandmarks(JSON.parse(readFileSync(new URL('../public/explorer/places.json',import.meta.url))).places);
test('landmark aliases locate dunes without replacing Chamarel village',()=>{
 for(const q of ['7 colors','seven coloured earth','Terres des Sept Couleurs'])assert.equal(searchPlaces(places,q)[0].scenery,'dunes');
 assert.equal(searchPlaces(places,'Chamarel')[0].kind,'village');
 assert.equal(searchPlaces(places,'Chamarel Waterfall')[0].scenery,'waterfall');
 assert.equal(places.filter(p=>p.id==='w133131985').length,1);
});
test('scenery is bounded to nearby detail views and removed at island scale',()=>{
 for(const site of LANDMARKS){
  const center=project(site.center);
  assert(nearbyLandmarks(center,75).includes(site));
  assert.equal(nearbyLandmarks(center,7600).length,0);
  assert.equal(nearbyLandmarks(center,75,true).length,0);
  assert.equal(nearbyLandmarks({x:center.x+1000,z:center.z},75).length,0);
  assert.match(site.description,/illustrative/);
 }
});
test('new landmark names and aliases resolve without duplicates or replacing villages',()=>{
 for(const [query,kind] of [['Le Morne Brabant','mountain'],['morne brabant','mountain'],['Trou-aux-Cerfs','crater'],['Curepipe volcano','crater'],['Ganga Talao','lake'],['Grand Bassin','lake']]){
  assert.equal(searchPlaces(places,query)[0]?.scenery,kind,query);
 }
 assert.equal(searchPlaces(places,'Le Morne')[0].kind,'village');
 for(const site of LANDMARKS){
  assert.equal(places.filter(p=>p.id===site.id).length,1);
  assert(site.view>site.radius*2&&site.view<450);
  assert(site.center[0]>57.2&&site.center[0]<57.9);
  assert(site.center[1]>-20.6&&site.center[1]<-19.9);
 }
});
