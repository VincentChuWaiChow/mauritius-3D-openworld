import test from 'node:test';
import assert from 'node:assert/strict';
import {TileStore,visibleTileKeys} from '../src/explorer/streaming.js';
test('decoded cache and simultaneous requests stay bounded while navigating',async()=>{
 let active=0,peak=0;
 const store=new TileStore(async key=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;return key;},8);
 const signal=new AbortController().signal;
 assert.equal((await store.read(Array.from({length:30},(_,i)=>''+i),signal)).length,30);
 assert.ok(peak<=4);assert.equal(store.cache.size,8);
 assert.ok(!store.cache.has('0'));
});
test('canceled requests never populate cache',async()=>{
 const ctl=new AbortController();
 const store=new TileStore(async()=>{ctl.abort();return {};});
 await assert.rejects(store.get('x',ctl.signal),{name:'AbortError'});
 assert.equal(store.cache.size,0);
});
test('viewport selects padded tiles, horizon coverage falls back instead of overloading',()=>{
 const index=new Set(['100_100','101_100','99_99']);
 assert.deepEqual(visibleTileKeys({minLon:57.5,maxLon:57.501,minLat:-20.5,maxLat:-20.499},index),['99_99','100_100','101_100']);
 assert.equal(visibleTileKeys({minLon:57,maxLon:58,minLat:-21,maxLat:-20},index),null);
});
