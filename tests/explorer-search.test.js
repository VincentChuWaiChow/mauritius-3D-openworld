import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchPlaces,panelAlpha} from '../src/explorer/search.js';
const places=JSON.parse(readFileSync(new URL('../public/explorer/places.json',import.meta.url))).places;
test('search covers places beyond four shortcuts and ignores accents and casing',()=>{
 for(const q of ['Curepipe','Quatre Bornes','Moka','Le Morne'])assert(searchPlaces(places,q).length,q);
 assert.deepEqual(searchPlaces(places,'mahébourg'),searchPlaces(places,'MAHEBOURG'));
 assert.equal(searchPlaces(places,'x').length,0);
 assert.equal(searchPlaces(places,'not-a-real-mauritius-place').length,0);
});
test('transparency is bounded and defaults to opaque',()=>{
 assert.equal(panelAlpha(0),1);assert.equal(panelAlpha(50),.5);
 assert.ok(Math.abs(panelAlpha(100)-.2)<1e-9);assert.equal(panelAlpha('invalid'),1);
});
