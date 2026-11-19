import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {project,unproject,distanceMeters,METERS_PER_WORLD_UNIT,ORIGIN} from '../src/explorer/geo.js';
import {decodeTerrarium,tileXY} from '../src/explorer/terrain.js';
import {THEMES,selectLook,windowSlots} from '../src/explorer/style.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const osm=JSON.parse(fs.readFileSync(path.join(root,'public/explorer/mauritius-osm.json'),'utf8'));
const mesh=JSON.parse(fs.readFileSync(path.join(root,'public/explorer/terrain-mesh.json'),'utf8'));
test('WGS84 round trips of four real Mauritius town coordinates',()=>{
 assert.equal(METERS_PER_WORLD_UNIT,10);
 const towns=[[57.5014,-20.1601],[57.5812,-20.0124],[57.707,-20.408],[57.374,-20.325]];
 for(const geo of towns){const [lon,lat]=unproject(project(geo));assert.ok(Math.abs(lon-geo[0])<1e-9);assert.ok(Math.abs(lat-geo[1])<1e-9);}
 assert.deepEqual(unproject(project([ORIGIN.lon,ORIGIN.lat])),[ORIGIN.lon,ORIGIN.lat]);
});
test('projected geographic distances stay within measured error bounds',()=>{
 // WGS84 geodesic baselines independently calculated with pyproj.Geod.
 for(const [from,to,meters] of [
  [[57.5,-20.16],[57.58,-20.01],18594.72],
  [[57.33,-20.4],[57.72,-20.43],40839.61],
  [[57.31,-20.5],[57.81,-19.98],77739.54],
  [[57.5,-20.16],[57.707,-20.408],34947.86],
 ]){const got=distanceMeters(from,to);assert.ok(Math.abs(got-meters)<10,`${got} vs ${meters}`);}
});
test('elevation decoding follows the published Terrarium specification',()=>{
 assert.equal(decodeTerrarium(128,0,0),0);
 assert.equal(decodeTerrarium(128,100,128),100.5);
 assert.equal(decodeTerrarium(127,255,0),-1);
 const [tx,ty]=tileXY([57.5014,-20.1601],12);
 assert.ok(tx>=0&&ty>=0&&tx<4096&&ty<4096);
});
test('source OSM features remain georeferenced; no fake road grids',()=>{
 assert.equal(osm.land.length,7);assert.equal(osm.mainRoads.length,3528);
 assert.equal(osm.regions.length,4);
 assert.deepEqual(osm.regions.map(r=>r.buildings.length),[360,360,360,360]);
 for(const r of osm.regions){
  assert.ok(r.roads.length>=100);
  for(const b of r.buildings){assert.ok(Number.isSafeInteger(b.id));assert.ok(b.points.length>=4);const first=b.points[0],last=b.points.at(-1);assert.deepEqual(first,last);}
  for(const road of r.roads){assert.ok(Number.isSafeInteger(road.id));assert.ok(road.points.length>=2);}
 }
});
test('triangles cover OSM coastlines without fabricated geographic outlines',()=>{
 assert.equal(mesh.overview.coverage,1);
 assert.ok(mesh.overview.triangleCount>5000);
 assert.deepEqual(Object.keys(mesh.regions).sort(),osm.regions.map(r=>r.id).sort());
 assert.ok(mesh.overview.approxAreaKm2>1500&&mesh.overview.approxAreaKm2<2300);
 for(const r of Object.values(mesh.regions)){assert.ok(r.coverage>=.985&&r.coverage<=1.015);assert.ok(r.triangleCount>300);}
});
test('Little World style changes materials, not footprint geometry',()=>{
 assert.ok(THEMES.little&&THEMES.tropical&&THEMES.dusk);
 assert.deepEqual(selectLook({id:306395387}),selectLook({id:306395387}));
 assert.notDeepEqual(selectLook({id:1}),selectLook({id:2}));
 assert.equal(windowSlots(.2,2,0).length,0);
 assert.ok(windowSlots(3,1.5,1).length>0);
});
