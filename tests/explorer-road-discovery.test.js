import test from 'node:test';
import assert from 'node:assert/strict';
import {searchRoads,pickRoad,pathAnchor} from '../src/explorer/roads.js';

const road=(id,name,locality='',aliases='')=>({id,name,locality,aliases,kind:'road',center:[57.5,-20.2],
  bounds:[57.4,-20.3,57.6,-20.1],wayIds:[Number(id.slice(1))],bucket:'geometry-03.json'});
const projected=(wayId,points)=>({wayId,points:points.map(([x,y])=>({x,y}))});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('road search combines accented name, alias/ref and locality prefix tokens in any order',()=>{
  const moka=road('r1','Royál Road','Near Móka','Route Royale A3');
  const flacq=road('r2','Royal Road','Near Flacq','Route Royale B2');
  assert.deepEqual(searchRoads([flacq,moka],'ROYAL road moka'),[moka]);
  assert.deepEqual(searchRoads([flacq,moka],'mók roy'),[moka]);
  assert.deepEqual(searchRoads([flacq,moka],'A3'),[moka]);
  assert.deepEqual(searchRoads([flacq,moka],'route royale moka'),[moka]);
  assert.deepEqual(searchRoads([flacq,moka],'royal missing'),[]);
  assert.deepEqual(searchRoads([flacq,moka],'oyal'),[]);
});

test('road search ranks exact and prefix names ahead of aliases and locality-only matches',()=>{
  const location=road('r4','Avenue A','Near Royal Road');
  const alias=road('r3','Avenue B','','Royal Road');
  const prefix=road('r2','Royal Road East','Near Moka');
  const exact=road('r1','Royal Road','Near Moka');
  assert.deepEqual(searchRoads([location,alias,prefix,exact],'royal road'),[exact,prefix,alias,location]);
});

test('road search keeps same-name components and duplicate IDs distinct with deterministic ties',()=>{
  const r2=road('r2','Royal Road','Near Moka'),r1=road('r1','Royal Road','Near Moka');
  const duplicate=road('r1','Royal Road','Near Moka');
  const flacq=road('r9','Royal Road','Near Flacq');
  assert.deepEqual(searchRoads([r2,r1,duplicate,flacq],'royal'),[flacq,r1,duplicate,r2]);
  assert.deepEqual(searchRoads([r2,r1],'royal'),searchRoads([r1,r2],'royal'));
  assert.notEqual(searchRoads([r1,duplicate],'royal')[0],searchRoads([r1,duplicate],'royal')[1]);
});

test('road search bounds limits, rejects empty/short malformed queries and does not mutate metadata',()=>{
  const roads=Array.from({length:9},(_,i)=>road(`r${i}`,'Royal Road',`Near Place ${i}`));
  const before=structuredClone(roads);
  for(const entry of roads){Object.freeze(entry.center);Object.freeze(entry.bounds);Object.freeze(entry.wayIds);Object.freeze(entry);}
  Object.freeze(roads);
  assert.equal(searchRoads(roads,'royal').length,6);
  assert.equal(searchRoads(roads,'royal',2.9).length,2);
  assert.equal(searchRoads(roads,'royal',100).length,9);
  for(const limit of [0,-1,NaN,Infinity,'2',null])assert.deepEqual(searchRoads(roads,'royal',limit),[]);
  for(const query of ['', ' ', 'r','é',null,undefined,2,{}])assert.deepEqual(searchRoads(roads,query),[]);
  assert.deepEqual(searchRoads([null,{},road('r2','')],'road'),[]);
  assert.deepEqual(searchRoads(null,'road'),[]);
  assert.deepEqual(roads,before);
});

test('road picking measures closest segment projection, not nearest vertex, and clamps endpoints',()=>{
  const paths=[projected(1,[[0,0],[100,0]]),projected(2,[[49,5],[51,5]])];
  assert.deepEqual(pickRoad(paths,{x:50,y:2}),{wayId:1,point:{x:50,y:0},distance:2,segment:0,t:.5});
  assert.deepEqual(pickRoad([paths[0]],{x:-3,y:4},5),{wayId:1,point:{x:0,y:0},distance:5,segment:0,t:0});
  assert.deepEqual(pickRoad([paths[0]],{x:103,y:4},5),{wayId:1,point:{x:100,y:0},distance:5,segment:0,t:1});
});

test('road picking includes the exact threshold and resolves ties by way ID then original segment',()=>{
  const a=projected(9,[[0,0],[10,0]]),b=projected(2,[[0,4],[10,4]]);
  assert.equal(pickRoad([a,b],{x:5,y:2},2).wayId,2);
  assert.equal(pickRoad([b,a],{x:5,y:2},2).wayId,2);
  assert.equal(pickRoad([a],{x:5,y:8}).distance,8);
  assert.equal(pickRoad([a],{x:5,y:8.000001}),null);
  assert.equal(pickRoad([a],{x:5,y:0},0).distance,0);
  assert.equal(pickRoad([projected(1,[[0,0],[10,0],[0,0]])],{x:5,y:2}).segment,0);
});

test('road picking ignores repeated/invalid segments without bridging gaps or mutating paths',()=>{
  const paths=[projected(1,[[0,0],[0,0],[NaN,0],[10,0],[10,10]])];
  const before=structuredClone(paths);
  assert.deepEqual(pickRoad(paths,{x:9,y:5}),{wayId:1,point:{x:10,y:5},distance:1,segment:3,t:.5});
  assert.equal(pickRoad(paths,{x:5,y:0},1),null);
  assert.deepEqual(paths,before);
  for(const input of [null,undefined,[],[null,{},projected(1,[[0,0]])],
    [projected(1,[[0,0],[0,0]])],[projected(1,[[Infinity,0],[10,10]])]]){
    assert.equal(pickRoad(input,{x:0,y:0}),null);
  }
  assert.equal(pickRoad([{points:[{x:0,y:0},{x:2,y:0}]}],{x:0,y:0}),null);
  for(const point of [null,{}, {x:NaN,y:0},{x:0,y:Infinity}])assert.equal(pickRoad(paths,point),null);
  for(const max of [-1,NaN,Infinity,'8'])assert.equal(pickRoad(paths,{x:10,y:5},max),null);
});

test('road anchor uses half the arc length of the longest disconnected path, not a bounding-box centre',()=>{
  const paths=[[[40,20],[41,20]],[[0,0],[8,0]],[[100,20],[101,20]]];
  assert.deepEqual(pathAnchor(paths),[4,0]);
  const bent=pathAnchor([[[0,0],[4,0],[4,2]]]);
  near(bent[0],3);near(bent[1],0);
});

test('road anchor compares lengths with latitude-aware scaling and returns an actual on-segment point',()=>{
  const anchor=pathAnchor([[[0,80],[10,80]],[[0,0],[0,2]]]);
  assert.deepEqual(anchor,[0,1]);
  const sloped=pathAnchor([[[57,-20],[57.1,-20.1],[57.4,-20.1]]]);
  near(sloped[1],-20.1);
  assert.ok(sloped[0]>57.1&&sloped[0]<57.4);
});

test('road anchor splits invalid vertices, ignores degenerates and preserves input',()=>{
  const paths=[[[0,0],[0,0],[NaN,0],[10,0],[14,0]],[[30,0],[32,0]]];
  const before=structuredClone(paths);
  assert.deepEqual(pathAnchor(paths),[12,0]);
  assert.deepEqual(paths,before);
  assert.equal(pathAnchor([[[0,0],[NaN,0],[10,0]]]),null);
  for(const input of [null,undefined,[],[null,{}],[[]],[[[1,2]]],[[[1,2],[1,2]]],
    [[[0,0],[Infinity,0]]],[[[181,0],[182,0]]],[[[0,91],[1,92]]]])assert.equal(pathAnchor(input),null);
  assert.deepEqual(pathAnchor([[[0,0],[2,0]],[[10,0],[12,0]]]),[1,0]);
});
