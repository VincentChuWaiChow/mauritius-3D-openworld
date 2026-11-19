import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../public/explorer/tiles/'+name+'.json',import.meta.url)));
test('Curepipe has offline streets and closed mapped footprints outside the town presets',()=>{
 const [lon,lat]=[57.522,-20.318];
 const key=Math.floor((lon-57)*200)+'_'+Math.floor((lat+21)*200);
 assert(read('index').keys.includes(key));const {buildings,roads}=read(key);
 assert(roads.some(r=>r.points.length>=2));assert(buildings.length>0);
 for(const b of buildings)assert.deepEqual(b.points[0],b.points.at(-1));
});
