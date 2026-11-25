import test from 'node:test';
import assert from 'node:assert/strict';
import {sites,weatherURL,validateWeather} from '../src/explorer/weather.js';
const now=1_800_000_000_000;
const row=()=>({current:{time:now/1000,interval:900,temperature_2m:23,wind_direction_10m:350,wind_speed_10m:19,precipitation:0,cloud_cover:65}});
test('request and regional results preserve the same seven geographic anchors',()=>{
  const url=new URL(weatherURL());
  assert.deepEqual(url.searchParams.get('latitude').split(',').map(Number),sites.map(s=>s.lat));
  assert.equal(validateWeather(sites.map(row),now).length,7);
});
test('stale and missing samples do not create simulated weather',()=>{
  const rows=sites.map(row);
  rows[0].current.time-=3601;rows[2].current.precipitation=null;
  assert.deepEqual(validateWeather(rows,now).map(s=>s.name),sites.filter((_,i)=>i!==0&&i!==2).map(s=>s.name));
  assert.throws(()=>validateWeather([],now));
});
