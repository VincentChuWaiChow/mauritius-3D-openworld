import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bundledKey, localBounds, createVectorScene, recolorVectorScene, disposeGroup } from "../src/vector-scene.js";
import { DESTINATIONS, FEATURED } from "../src/experience.js";
import { PALETTES } from "../src/palettes.js";
import { parseOSM } from "../src/data-source.js";
const data = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));

test("four featured scenes contain licensed real footprints, roads and bounded coordinates", () => {
  for (const key of FEATURED) {
    const scene = data(key);
    assert.equal(parseOSM(scene).elements.length, scene.elements.length);
    assert.match(scene.license, /odbl\/1-0/);
    assert.match(scene.source, /geofabrik/);
    assert.equal(scene.sourceSHA256.length, 64);
    assert.ok(scene.elements.filter(e=>e.tags?.building).length>300, key);
    assert.ok(scene.elements.filter(e=>e.tags?.highway).length>50, key);
    assert.equal(bundledKey(DESTINATIONS[key]),key);
    const bounds=localBounds(scene.bounds, DESTINATIONS[key]);
    assert.ok(bounds.minX<0 && bounds.maxX>0 && bounds.minZ<0 && bounds.maxZ>0);
    assert.ok(bounds.maxX<2000 && bounds.maxZ<2200);
  }
  assert.equal(bundledKey(DESTINATIONS.mauritius),"coastline");
  assert.equal(bundledKey(DESTINATIONS.rodrigues),null);
});

test("coastline is made of closed geographic rings, not fabricated connections", () => {
  const coast=data("coastline");
  assert.ok(coast.rings.length>1);
  for (const ring of coast.rings) {
    assert.deepEqual(ring[0],ring.at(-1));
    assert.ok(ring.every(p=>p.lat>-20.7 && p.lat<-19.8 && p.lon>57.1 && p.lon<57.9));
  }
});

test("label-free vector geometry is finite, upward bounded and recolorable", () => {
  const coast={rings:[[{lat:-20.17,lon:57.49},{lat:-20.15,lon:57.49},{lat:-20.15,lon:57.52},{lat:-20.17,lon:57.52},{lat:-20.17,lon:57.49}]]};
  const road={type:"way",tags:{highway:"residential"},geometry:coast.rings[0].slice(0,2)};
  const world=createVectorScene(coast,[road],DESTINATIONS.portLouis,PALETTES.island);
  assert.equal(world.children.length,4); // land, shadow, road, road edge
  for(const mesh of world.children) assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
  recolorVectorScene(world,PALETTES.midnight,false);
  assert.equal(world.children.find(c=>c.userData.shadow).visible,false);
  for(const child of world.children) { child.geometry.dispose(); child.material.dispose(); }
});

test("scene cleanup disposes instance buffers but preserves shared building materials", () => {
  const group=new THREE.Group();
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2);
  const disposed=[];
  mesh.addEventListener("dispose",()=>disposed.push("instances"));
  mesh.geometry.addEventListener("dispose",()=>disposed.push("geometry"));
  mesh.material.addEventListener("dispose",()=>disposed.push("material"));
  group.add(mesh);disposeGroup(group);
  assert.deepEqual(disposed,["instances","geometry"]);
  assert.equal(group.children.length,0);
  group.add(mesh);disposeGroup(group,true);
  assert.ok(disposed.includes("material"));
});
