import test from 'node:test';
import assert from 'node:assert/strict';
import {ribbon,roadPass} from '../src/explorer/road-ribbon.js';

test('roundabout shares both pavement edges through bends and the closing seam',()=>{
  const pts=Array.from({length:17},(_,i)=>({x:10*Math.cos(i*Math.PI/8),z:10*Math.sin(i*Math.PI/8),y:0}));
  pts.splice(2,0,pts[1]); // repeated OSM node
  const faces=[];
  ribbon(pts,2,(...quad)=>faces.push(quad));
  assert.equal(faces.length,16);
  for(let i=0;i<faces.length;i++){
    const q=faces[i],next=faces[(i+1)%faces.length];
    for(const [a,b] of [[q[3],next[0]],[q[2],next[1]]])
      assert.ok(Math.hypot(...a.map((v,j)=>v-b[j]))<1e-8);
    assert.ok(q[0].every(Number.isFinite));
  }
});
test('software pavement always covers its casing and sits below its markings',()=>{
  const palette={roads:'#444',sidewalk:'#ddd'};
  assert.ok(roadPass(palette.sidewalk,palette)<roadPass(palette.roads,palette));
  assert.ok(roadPass(palette.roads,palette)<roadPass('#fff',palette));
});

test('ribbon miter reach respects building-clearance caps at both segment ends',()=>{
 const points=[{x:0,y:0,z:0,maxReach:.15},{x:3,y:0,z:0,maxReach:.1},{x:3,y:0,z:3,maxReach:0}];
 const faces=[];ribbon(points,2,(...q)=>faces.push(q));
 for(let i=0;i<faces.length;i++)for(const [v,p] of [[faces[i][0],points[i]],[faces[i][1],points[i]],[faces[i][2],points[i+1]],[faces[i][3],points[i+1]]]){
  assert.ok(Math.hypot(v[0]-p.x,v[2]-p.z)<=p.maxReach+1e-10);
 }
});
