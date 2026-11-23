import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/explorer/app.js',import.meta.url),'utf8');
// Exercise the production listener, not a second implementation of the race.
function taps(){
 let resolve;
 const ready=new Promise(r=>{resolve=r;}),selected=[];
 const scope={roadTapVersion:0,roadSelectionVersion:0,down:null,overviewMode:false,
  renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0})}},host:{clientWidth:100,clientHeight:100},
  pointer:{set(){}},raycaster:{setFromCamera(){}},camera:{},root:{updateMatrixWorld(){}},groups:{buildings:{visible:false}},
  loadRoadData:()=>ready,pickVisibleRoad:x=>({road:x}),
  selectRoad:x=>{scope.roadTapVersion++;scope.roadSelectionVersion++;selected.push(x);}};
 const body=source.match(/addEventListener\('pointerup',async e=>\{([\s\S]*?)\n \}\);/)?.[1];
 assert(body,'Production tap listener found');
 const handler=runInNewContext('(async e=>{'+body+'})',scope);
 return {scope,selected,resolve:()=>resolve(true),tap:x=>{scope.down=[x,0];return handler({clientX:x,clientY:0,pointerType:'touch'});}};
}
test('latest map tap wins while the lazy road index is pending',async()=>{
 const h=taps(),first=h.tap(10),latest=h.tap(20);h.resolve();await Promise.all([first,latest]);
 assert.deepEqual(h.selected,[20]);
});
test('camera change invalidates pending screen-coordinate road intent',async()=>{
 const h=taps(),pending=h.tap(10);
 const body=source.match(/controls.addEventListener\('change',\(\)=>\{([^}]*)\}\)/)?.[1];
 assert(body,'Production camera change listener found');runInNewContext(body,h.scope);
 h.resolve();await pending;assert.deepEqual(h.selected,[]);
});
test('newer selection intent invalidates an older pending map tap',async()=>{
 const h=taps(),pending=h.tap(10);h.scope.selectRoad(30);h.resolve();await pending;
 assert.deepEqual(h.selected,[30]);
});
