import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DESTINATIONS, DEFAULT_DESTINATION, DEFAULT_PALETTE, FEATURED, renderExperience, setCameraFrame } from '../src/experience.js';
import { PALETTES } from '../src/palettes.js';
import { createBuildingBatches, rescaleBuildingBatches, recolorBuildingBatches } from '../src/buildings.js';

test('illustrated experience starts in Port Louis and retains all original destinations', () => {
  assert.equal(DEFAULT_DESTINATION, 'portLouis');
  assert.equal(DEFAULT_PALETTE, 'island');
  assert.equal(PALETTES[DEFAULT_PALETTE].illustrated, true);
  for (const key of ['mauritius', 'portLouis', 'grandBaie', 'flicEnFlac', 'leMorne', 'chamarel', 'colouredEarth', 'curepipe', 'mahebourg', 'rodrigues', 'agalega', 'saintBrandon']) {
    assert.ok(Number.isFinite(DESTINATIONS[key].lat));
    assert.ok(Number.isFinite(DESTINATIONS[key].lon));
  }
  assert.deepEqual(FEATURED, ['portLouis', 'grandBaie', 'mahebourg', 'tamarin']);
});

test('experience markup provides unique live control targets and consistent initial state', () => {
  const html = renderExperience(PALETTES);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ['destination', 'go', 'center', 'reset', 'snapshot', 'height', 'heightText', 'relief', 'reliefText', 'surfaceDetail', 'surfaceText', 'buildings', 'shadows', 'status', 'locationChip', 'legendWater', 'legendPark', 'legendRoad', 'layersToggle', 'layersPanel', 'helpToggle', 'helpPanel', 'zoomIn', 'zoomOut', 'rotate', 'tilt', 'wholeIsland', 'markersLayer']) assert.ok(ids.includes(id), id);
  assert.match(html, /value="portLouis" selected/);
  assert.match(html, /data-destination="portLouis"[^>]*aria-pressed="true"/);
  assert.equal((html.match(/data-destination="/g) || []).length, 4);
  for (const panel of ['layersPanel', 'helpPanel']) assert.match(html, new RegExp(`id="${panel}"[^>]*hidden`));
  for (const key of Object.keys(PALETTES)) assert.ok(html.includes(`data-palette="${key}"`));
  assert.match(html, /id="wholeIsland"[^>]*aria-label="Whole island"/,
    'the mobile icon-only whole-island button must retain an accessible name');
});

test('orthographic framing preserves zoom across landscape/portrait resize', () => {
  const camera = new THREE.OrthographicCamera();
  camera.zoom = 2;
  setCameraFrame(camera, 1200, 1.5);
  assert.deepEqual([camera.left, camera.right, camera.top, camera.bottom], [-900, 900, 600, -600]);
  const previous = camera.projectionMatrix.clone();
  setCameraFrame(camera, 1200, .5);
  assert.equal(camera.zoom, 2);
  assert.equal(camera.right, 300);
  assert.equal(camera.top, 600);
  assert.notDeepEqual(camera.projectionMatrix.elements, previous.elements);
  assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
});

test('real footprint batching retains flat faces, terrain anchoring and recolorable roofs', () => {
  const origin = DESTINATIONS.portLouis;
  const element = { type: 'way', id: 42, tags: { building: 'house', height: '12' }, geometry: [
    { lat: origin.lat, lon: origin.lon }, { lat: origin.lat, lon: origin.lon + .0002 },
    { lat: origin.lat + .0002, lon: origin.lon + .0002 }, { lat: origin.lat + .0002, lon: origin.lon },
    { lat: origin.lat, lon: origin.lon },
  ] };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
  const { meshes, count } = createBuildingBatches([element], origin, PALETTES.island, material, () => 20, 1, 2.5);
  assert.equal(count, 1);
  assert.equal(meshes.length, 1);
  const group = new THREE.Group();
  group.add(...meshes);
  const geo = meshes[0].geometry;
  for (const attr of ['position', 'normal', 'patternId', 'groundMeters', 'structureMeters', 'color']) assert.ok(geo.getAttribute(attr));
  const colorsBefore = geo.getAttribute('color').array.slice();
  const ranges = meshes[0].userData.buildingRanges[0].faceGroups;
  assert.ok(ranges.some(face => face.roof));
  assert.ok(ranges.some(face => !face.roof));
  rescaleBuildingBatches(group, 2, 3);
  const position = geo.getAttribute('position'), structure = geo.getAttribute('structureMeters');
  for (let i = 0; i < position.count; i++) assert.ok(Math.abs(position.getY(i) - (40 + structure.getX(i) * 3 + .3)) < .0001);
  recolorBuildingBatches(group, PALETTES.midnight);
  assert.notDeepEqual(geo.getAttribute('color').array, colorsBefore);
  assert.ok(geo.boundingSphere.radius > 0);
  geo.dispose(); material.dispose();
});
