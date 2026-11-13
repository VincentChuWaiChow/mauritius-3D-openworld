import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PALETTES } from './palettes.js';
import { createBuildingBatches, projectLocal, recolorBuildingBatches, rescaleBuildingBatches } from './buildings.js';
import { TerrainCache, tileToLat, tileToLon } from './terrain.js';
import { loadAtlases, createTexturedBuildingMaterial } from './materials.js';
import {
  mapVertexShader, mapFragmentShader, seaVertexShader, seaFragmentShader,
} from './map-shaders.js';
import { DESTINATIONS, DEFAULT_DESTINATION, DEFAULT_PALETTE, renderExperience, setCameraFrame } from './experience.js';
import './style.css';

// Island overview uses z11: 5x5 visible raster tiles cover the main island.
// Detailed town views use z15: tiles and buildings are requested only on demand.
let paletteName = DEFAULT_PALETTE;
let palette = PALETTES[paletteName];
let current = DESTINATIONS[DEFAULT_DESTINATION];
let serial = 0;
let abortBuildings = null;
let buildingsEnabled = true;
let buildingsLoaded = false;
let shadowEnabled = true;
let heightScale = 2.5; // Visual exaggeration of the OSM or estimated building heights.
let terrainRelief = 1; // Visual DEM exaggeration; each height still comes from the DEM.
let textureStrength = 0;
let terrainStats = { succeeded: 0, requested: 0 };
const terrainCache = new TerrainCache();
let tileSize = 1;
let mapCenter = { lat: current.lat, lon: current.lon };

const app = document.querySelector('#app');
app.innerHTML = renderExperience(PALETTES);

const statusEl = document.querySelector('#status');
const destinationEl = document.querySelector('#destination');
const heightOutput = document.querySelector('#heightText');
const reliefOutput = document.querySelector('#reliefText');
const surfaceOutput = document.querySelector('#surfaceText');
const setStatus = message => { statusEl.textContent = message; };
let mapWarning = '';
let buildingRequest = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.sky);
scene.fog = new THREE.FogExp2(palette.fog, 0.000014);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  console.error('WebGL renderer unavailable', error);
  setStatus('WebGL2 is required. Enable hardware acceleration in your browser.');
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = palette.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 600000);
let frameHeight = 1100;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.screenSpacePanning = true;
controls.minZoom = 0.45;
controls.maxZoom = 12;
controls.maxPolarAngle = Math.PI * 0.49;

const hemisphere = new THREE.HemisphereLight(palette.hemisphereSky, palette.hemisphereGround, palette.ambientIntensity);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
sun.position.set(-7000, 12000, 4500);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 100;
sun.shadow.camera.far = 45000;
sun.shadow.normalBias = 0.02;
sun.shadow.bias = -0.00008;
sun.shadow.radius = 2.5;
scene.add(sun, sun.target);

const mapGroup = new THREE.Group();
const buildingGroup = new THREE.Group();
scene.add(mapGroup, buildingGroup);

// Every terrain tile has a transparent receiver with the exact same relief.
// Unlike a flat shadow plane, building shadows adhere to the ground surface.
const groundShadowMaterial = new THREE.ShadowMaterial({
  color: '#132d29', opacity: .28, depthWrite: false,
});
const atlases = loadAtlases();

// Uniform references are shared across all tile shaders. Recoloring a map
// only updates these colors; it never requires another tile download.
const tileUniforms = {
  ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  uLand: { value: new THREE.Color(palette.land) },
  uWater: { value: new THREE.Color(palette.lagoon) },
  uDeepWater: { value: new THREE.Color(palette.ocean) },
  uPark: { value: new THREE.Color(palette.vegetation) },
  uRoad: { value: new THREE.Color(palette.roads) },
  uOriginal: { value: palette.originalTiles ? 1 : 0 },
  uIllustrated: { value: palette.illustrated ? 1 : 0 },
  uSurfaceAtlas: { value: atlases.surface },
  uTextureStrength: { value: textureStrength },
  uChamarel: { value: new THREE.Vector2() },
};
const oceanTime = { value: 0 };
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(900000, 900000),
  new THREE.ShaderMaterial({
    vertexShader: seaVertexShader,
    fragmentShader: seaFragmentShader,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uWater: tileUniforms.uDeepWater, uTime: oceanTime, uIllustrated: tileUniforms.uIllustrated,
    },
    fog: true,
  }),
);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -2;
scene.add(ocean);

const buildingMaterial = createTexturedBuildingMaterial(atlases.buildings, palette);
const tileLoader = new THREE.TextureLoader();
tileLoader.setCrossOrigin('anonymous');

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
const RAD = Math.PI / 180;
const EARTH_RADIUS = 6378137;
function lon2tile(lon, z) { return Math.floor((lon + 180) / 360 * 2 ** z); }
function lat2tile(lat, z) { return Math.floor((1 - Math.asinh(Math.tan(lat * RAD)) / Math.PI) / 2 * 2 ** z); }
function tile2lon(x, z) { return x / 2 ** z * 360 - 180; }
function tile2lat(y, z) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) / RAD; }
function metersPerTile(lat, z) { return 40075016.686 * Math.cos(lat * RAD) / 2 ** z; }
function inverseProject(x, z) {
  return {
    lat: mapCenter.lat - (z / EARTH_RADIUS) / RAD,
    lon: mapCenter.lon + (x / (EARTH_RADIUS * Math.cos(mapCenter.lat * RAD))) / RAD,
  };
}

function clearGroup(group, disposeMaterials = false) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose();
    if (disposeMaterials) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material?.dispose();
    }
  }
}
function clearTiles() {
  for (const tile of [...mapGroup.children]) {
    const tex = tile.material.uniforms.uMap.value;
    tile.geometry.dispose();
    tile.material.dispose();
    tex.dispose();
    mapGroup.remove(tile);
  }
}

function recolor(name) {
  paletteName = name;
  palette = PALETTES[name];
  if (!palette) return;
  const p = palette;
  document.body.classList.toggle('night', name === 'midnight');
  document.documentElement.style.setProperty('--accent', p.accent);
  scene.background.set(p.sky);
  scene.fog.color.set(p.fog);
  tileUniforms.uLand.value.set(p.land);
  tileUniforms.uWater.value.set(p.lagoon);
  tileUniforms.uDeepWater.value.set(p.ocean);
  tileUniforms.uPark.value.set(p.vegetation);
  tileUniforms.uRoad.value.set(p.roads);
  tileUniforms.uOriginal.value = p.originalTiles ? 1 : 0;
  tileUniforms.uIllustrated.value = p.illustrated ? 1 : 0;
  buildingMaterial.userData.illustrated.value = p.illustrated ? 1 : 0;
  tileUniforms.uTextureStrength.value = textureStrength * (name === 'midnight' ? .30 : 1);
  hemisphere.color.set(p.hemisphereSky);
  hemisphere.groundColor.set(p.hemisphereGround);
  hemisphere.intensity = p.ambientIntensity;
  sun.color.set(p.sun);
  sun.intensity = p.sunIntensity;
  renderer.toneMapping = p.illustrated ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = p.exposure;
  buildingMaterial.emissive.set(p.buildingEmissive);
  buildingMaterial.userData.textureStrength.value = textureStrength * (name === 'midnight' ? .4 : 1);
  recolorBuildingBatches(buildingGroup, p);
  document.querySelector('#legendWater').style.background = p.lagoon;
  document.querySelector('#legendPark').style.background = p.vegetation;
  document.querySelector('#legendRoad').style.background = p.roads;
  for (const button of document.querySelectorAll('[data-palette]')) {
    const selected = button.dataset.palette === name;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function configureShadows(zoom) {
  // Limit sun shadow coverage to a small local area. Shadowing an entire
  // 70-km island using a 2k texture produces blurry and expensive results.
  sun.castShadow = shadowEnabled && zoom >= 14;
  for (const tile of mapGroup.children) {
    if (tile.children[0]) tile.children[0].visible = sun.castShadow;
  }
  const span = zoom >= 14 ? 4500 : 35000;
  const s = sun.shadow.camera;
  s.left = -span; s.right = span;
  s.top = span; s.bottom = -span;
  s.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
}

/** Geometry follows actual Mercator tile bounds, not a flat projected square. */
function buildTerrainGeometry(x, y, z, place) {
  const segments = z >= 14 ? 26 : 52;
  const positions = [], uvs = [], elevations = [], faces = [];
  for (let row = 0; row <= segments; row++) {
    const lat = tileToLat(y + row / segments, z);
    for (let col = 0; col <= segments; col++) {
      const lon = tileToLon(x + col / segments, z);
      const point = projectLocal(lat, lon, place.lat, place.lon);
      const meters = terrainCache.sample(lat, lon);
      positions.push(point.x, meters * terrainRelief, point.z);
      uvs.push(col / segments, 1 - row / segments);
      elevations.push(meters);
    }
  }
  const stride = segments + 1;
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      faces.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(faces);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('elevation', new THREE.Float32BufferAttribute(elevations, 1));
  geo.computeVertexNormals();
  return geo;
}

function rebuildTerrainTiles(place) {
  for (const tile of mapGroup.children) {
    const { x, y, zoom } = tile.userData;
    const old = tile.geometry;
    tile.geometry = buildTerrainGeometry(x, y, zoom, place);
    if (tile.children[0]) tile.children[0].geometry = tile.geometry;
    old.dispose();
  }
}

function updateRelief() {
  for (const tile of mapGroup.children) {
    const geo = tile.geometry;
    const positions = geo.getAttribute('position');
    const elevation = geo.getAttribute('elevation');
    for (let i = 0; i < positions.count; i++) positions.setY(i, elevation.getX(i) * terrainRelief);
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  rescaleBuildingBatches(buildingGroup, terrainRelief, heightScale);
  controls.target.y = terrainCache.sample(current.lat, current.lon) * terrainRelief;
  controls.update();
}

async function loadMapTiles(place, loadSerial) {
  clearTiles();
  mapCenter = { lat: place.lat, lon: place.lon };
  const chamarel = projectLocal(-20.44065, 57.3739, place.lat, place.lon);
  tileUniforms.uChamarel.value.set(chamarel.x, chamarel.z);
  const { lat, lon, zoom } = place;
  const cx = lon2tile(lon, zoom), cy = lat2tile(lat, zoom);
  // 25 tiles maximum. No background prefetch or offline tile downloading.
  const radius = 2;
  const positions = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      positions.push({ x: cx + dx, y: cy + dy, distance: dx * dx + dy * dy });
    }
  }
  positions.sort((a, b) => a.distance - b.distance);
  tileSize = metersPerTile(lat, zoom);
  let cursor = 0;
  let completed = 0;
  let failed = 0;
  // Load elevation and the visible OSM raster tiles concurrently, to avoid
  // blocking the map while a terrain service is slow or unavailable.
  const terrainTask = terrainCache.prime(positions, zoom);
  const workers = Array.from({ length: 5 }, async () => {
    while (cursor < positions.length && loadSerial === serial) {
      const { x, y } = positions[cursor++];
      await new Promise(resolve => {
        tileLoader.load(
          `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
          texture => {
            if (loadSerial === serial) {
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
              const geometry = buildTerrainGeometry(x, y, zoom, place);
              const material = new THREE.ShaderMaterial({
                vertexShader: mapVertexShader,
                fragmentShader: mapFragmentShader,
                uniforms: { ...tileUniforms, uMap: { value: texture } },
                fog: true,
              });
              const tile = new THREE.Mesh(geometry, material);
              tile.userData = { x, y, zoom };
              tile.renderOrder = 1;
              // Share geometry between the terrain and its transparent receiver.
              const receiver = new THREE.Mesh(geometry, groundShadowMaterial);
              receiver.receiveShadow = true;
              receiver.visible = shadowEnabled && zoom >= 14;
              receiver.position.y = .09;
              receiver.renderOrder = 2;
              tile.add(receiver);
              mapGroup.add(tile);
            } else {
              texture.dispose();
            }
            completed++;
            resolve();
          },
          undefined,
          () => { failed++; completed++; resolve(); },
        );
      });
    }
  });
  await Promise.all(workers);
  terrainStats = await terrainTask;
  if (loadSerial === serial) { rebuildTerrainTiles(place); configureShadows(zoom); }
  return { completed, failed, terrain: terrainStats };
}

async function loadBuildings(place, loadSerial) {
  const request = ++buildingRequest;
  abortBuildings?.abort();
  clearGroup(buildingGroup);
  clearPlaceMarkers();
  buildingsLoaded = false;
  if (!buildingsEnabled || place.zoom < 14) {
    setStatus(place.zoom < 14 ? 'Island overview ready. Select a town or double-click a point to reveal 3D buildings.'
      : 'Map ready. Turn on 3D buildings to load local footprints.');
    return;
  }
  // Keep the request aligned to visible high-detail tiles.
  const span = place.zoom >= 15 ? 0.022 : 0.033;
  const south = (place.lat - span).toFixed(6);
  const west = (place.lon - span).toFixed(6);
  const north = (place.lat + span).toFixed(6);
  const east = (place.lon + span).toFixed(6);
  const query = `[out:json][timeout:35];way[building](${south},${west},${north},${east});out tags geom;`;
  setStatus(`Loading local 3D building footprints for ${place.name}…`);
  abortBuildings = new AbortController();
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(query)}`,
      signal: abortBuildings.signal,
    });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
    const result = await response.json();
    if (loadSerial !== serial || request !== buildingRequest) return;
    // One geometry per OSM building is created, then merged into batches.
    const { meshes, count } = createBuildingBatches(result.elements, place, palette, buildingMaterial,
      (lat, lon) => terrainCache.sample(lat, lon), terrainRelief, heightScale);
    if (loadSerial !== serial) {
      for (const mesh of meshes) mesh.geometry.dispose();
      return;
    }
    for (const mesh of meshes) {
      buildingGroup.add(mesh);
    }
    setPlaceMarkers(result.elements, place);
    buildingGroup.visible = buildingsEnabled;
    buildingsLoaded = true;
    setStatus(`${mapWarning}${count.toLocaleString()} buildings · ${place.name} · An illustrated view of real places`);
  } catch (error) {
    if (error.name === 'AbortError' || loadSerial !== serial || request !== buildingRequest) return;
    console.error(error);
    setStatus('Map loaded. Overpass building data is unavailable or rate-limited; the colored map remains usable.');
  }
}

async function goTo(place) {
  const loadSerial = ++serial;
  buildingRequest++;
  mapWarning = '';
  abortBuildings?.abort();
  current = place;
  buildingsLoaded = false;
  clearGroup(buildingGroup);
  configureShadows(place.zoom);
  scene.fog.density = place.zoom >= 14 ? 0.000045 : 0.000013;
  updateLocationUI(place);
  clearPlaceMarkers();
  setStatus(`Loading ${place.name}…`);
  const size = metersPerTile(place.lat, place.zoom);
  resetCamera(place, size);
  const { failed, terrain } = await loadMapTiles(place, loadSerial);
  if (loadSerial !== serial) return;
  mapWarning = failed ? `${failed} map tiles unavailable · ` : !terrain.succeeded ? 'Elevation unavailable · ' : '';
  if (failed) setStatus(`${failed} OSM tiles failed; try again. Terrain ${terrain.succeeded}/${terrain.requested}.`);
  else if (!terrain.succeeded) setStatus('Map loaded with photo-inspired textures; DEM unavailable, so this view is temporarily flat.');
  else setStatus(`Map textured • ${terrain.succeeded}/${terrain.requested} elevation tiles. Loading buildings if enabled…`);
  controls.target.y = terrainCache.sample(place.lat, place.lon) * terrainRelief;
  controls.update();
  await loadBuildings(place, loadSerial);
}

function focusOnWorldPoint(point) {
  const coords = inverseProject(point.x, point.z);
  goTo({
    name: `Custom ${coords.lat.toFixed(4)}°, ${coords.lon.toFixed(4)}°`,
    lat: clamp(coords.lat, -85, 85),
    lon: clamp(coords.lon, -180, 180),
    zoom: 15,
  });
}

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
function groundAt(clientX, clientY) {
  const canvasRect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
    -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const land = raycaster.intersectObjects(mapGroup.children, false);
  return land.length ? land[0].point : raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
}

function updateLocationUI(place) {
  const key = Object.keys(DESTINATIONS).find(key => DESTINATIONS[key] === place);
  // Custom focus positions have no matching preset: don't leave a stale town selected.
  destinationEl.value = key || '';
  document.querySelector('#go').disabled = !key;
  document.querySelector('#locationChip').textContent = `Exploring ${place.name}`;
  document.querySelector('#placeName').textContent = place.name.startsWith('Custom ') ? 'Somewhere new' : place.name;
  document.querySelector('#placeRegion').textContent = place.region || 'A LITTLE MORE TO DISCOVER';
  document.querySelector('#placeDescription').textContent = place.description || 'Take the scenic route. Explore the streets, landscape and little details of this corner of the island.';
  for (const button of document.querySelectorAll('[data-destination]')) {
    const selected = button.dataset.destination === key;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function resetCamera(place, size = metersPerTile(place.lat, place.zoom)) {
  // Consume pending drag inertia before assigning the new frame. Otherwise
  // OrbitControls continues rotating/panning after a reset or location change.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
  frameHeight = size * (place.zoom >= 14 ? .9 : 4.7);
  camera.zoom = 1;
  setCameraFrame(camera, frameHeight, window.innerWidth / window.innerHeight);
  controls.target.set(0, terrainCache.sample(place.lat, place.lon) * terrainRelief, 0);
  camera.position.copy(controls.target).add(new THREE.Vector3(-size * .85, size * 1.3, -size * 1.5));
  controls.autoRotate = false;
  camera.lookAt(controls.target);
  controls.update();
  document.querySelector('#tilt').setAttribute('aria-pressed', 'false');
}

const markerLayer = document.querySelector('#markersLayer');
const popover = document.querySelector('#placePopover');
let placeMarkers = [];
function clearPlaceMarkers() {
  placeMarkers = [];
  markerLayer.replaceChildren();
  popover.hidden = true;
}

function setPlaceMarkers(elements, place) {
  clearPlaceMarkers();
  // Only name actual downloaded buildings; no invented landmarks or random pins.
  const named = (elements || []).filter(el => el.type === 'way' && el.tags?.name && el.geometry?.length);
  for (const el of named) {
    const lat = el.geometry.reduce((sum, p) => sum + p.lat, 0) / el.geometry.length;
    const lon = el.geometry.reduce((sum, p) => sum + p.lon, 0) / el.geometry.length;
    const point = projectLocal(lat, lon, place.lat, place.lon);
    if (Math.hypot(point.x, point.z) > 900 || placeMarkers.some(p => Math.hypot(p.x - point.x, p.z - point.z) < 100)) continue;
    const button = document.createElement('button');
    button.className = 'placePin';
    button.setAttribute('aria-label', el.tags.name);
    button.title = el.tags.name;
    button.innerHTML = '<span aria-hidden="true"></span>';
    button.addEventListener('click', () => {
      popover.textContent = `${el.tags.name} · OpenStreetMap place`;
      popover.hidden = false;
    });
    markerLayer.appendChild(button);
    placeMarkers.push({ ...point, lat, lon, button });
    if (placeMarkers.length === 8) break;
  }
}

const projectedMarker = new THREE.Vector3();
function updatePlaceMarkers() {
  const occupied = [];
  for (const marker of placeMarkers) {
    projectedMarker.set(marker.x, terrainCache.sample(marker.lat, marker.lon) * terrainRelief + 40, marker.z).project(camera);
    const x = (projectedMarker.x * .5 + .5) * window.innerWidth;
    const y = (-projectedMarker.y * .5 + .5) * window.innerHeight;
    const visible = projectedMarker.z > -1 && projectedMarker.z < 1 && x > 30 && x < window.innerWidth - 70 && y > 120 && y < window.innerHeight - 180 && !occupied.some(p => Math.hypot(p.x - x, p.y - y) < 48);
    marker.button.hidden = !visible;
    if (visible) {
      marker.button.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      occupied.push({ x, y });
    }
  }
}

function setPanel(name, open, restoreFocus = false) {
  document.querySelector(`#${name}Panel`).hidden = !open;
  document.querySelector(`#${name}Toggle`).setAttribute('aria-expanded', String(open));
  if (open && name === 'layers') document.querySelector('#layersClose').focus();
  if (!open && restoreFocus) document.querySelector(`#${name}Toggle`).focus();
}
for (const name of ['layers', 'help']) {
  document.querySelector(`#${name}Toggle`).addEventListener('click', () => {
    const open = document.querySelector(`#${name}Panel`).hidden;
    setPanel(name === 'layers' ? 'help' : 'layers', false);
    setPanel(name, open);
  });
}
document.querySelector('#layersClose').addEventListener('click', () => setPanel('layers', false, true));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    for (const name of ['layers', 'help']) {
      if (!document.querySelector(`#${name}Panel`).hidden) setPanel(name, false, true);
    }
    popover.hidden = true;
  }
});
document.querySelector('#wholeIsland').addEventListener('click', () => goTo(DESTINATIONS.mauritius));
document.querySelector('#brandHome').addEventListener('click', event => {
  event.preventDefault();
  goTo(DESTINATIONS.mauritius);
});
for (const button of document.querySelectorAll('[data-destination]')) {
  button.addEventListener('click', () => goTo(DESTINATIONS[button.dataset.destination]));
}
for (const [id, factor] of [['zoomIn', 1.3], ['zoomOut', 1 / 1.3]]) {
  document.querySelector(`#${id}`).addEventListener('click', () => {
    camera.zoom = clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix();
  });
}
document.querySelector('#rotate').addEventListener('click', () => {
  camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4).add(controls.target);
  controls.update();
});
document.querySelector('#tilt').addEventListener('click', event => {
  const top = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  const distance = camera.position.distanceTo(controls.target);
  const offset = top ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(-.85, 1.3, -1.5).normalize();
  camera.position.copy(controls.target).addScaledVector(offset, distance);
  controls.update();
  event.currentTarget.setAttribute('aria-pressed', String(top));
});
document.querySelector('#markers').addEventListener('change', event => {
  markerLayer.hidden = !event.target.checked;
  popover.hidden = true;
});

document.querySelector('#go').addEventListener('click', () => {
  if (DESTINATIONS[destinationEl.value]) goTo(DESTINATIONS[destinationEl.value]);
});
destinationEl.addEventListener('change', () => goTo(DESTINATIONS[destinationEl.value]));
document.querySelector('#reset').addEventListener('click', () => resetCamera(current));
document.querySelector('#center').addEventListener('click', () => {
  const point = groundAt(window.innerWidth / 2, window.innerHeight / 2);
  if (point) focusOnWorldPoint(point);
});
renderer.domElement.addEventListener('dblclick', event => {
  const point = groundAt(event.clientX, event.clientY);
  if (point) focusOnWorldPoint(point);
});
for (const button of document.querySelectorAll('[data-palette]')) {
  button.addEventListener('click', () => recolor(button.dataset.palette));
}
document.querySelector('#height').addEventListener('input', event => {
  heightScale = Number(event.target.value);
  heightOutput.textContent = `${heightScale.toFixed(1)}×`;
  rescaleBuildingBatches(buildingGroup, terrainRelief, heightScale);
});
document.querySelector('#relief').addEventListener('input', event => {
  terrainRelief = Number(event.target.value);
  reliefOutput.textContent = `${terrainRelief.toFixed(1)}×`;
  updateRelief();
});
document.querySelector('#surfaceDetail').addEventListener('input', event => {
  textureStrength = Number(event.target.value) / 100;
  surfaceOutput.textContent = `${Math.round(textureStrength * 100)}%`;
  tileUniforms.uTextureStrength.value = textureStrength * (paletteName === 'midnight' ? .30 : 1);
  buildingMaterial.userData.textureStrength.value = textureStrength * (paletteName === 'midnight' ? .4 : 1);
});
document.querySelector('#buildings').addEventListener('change', event => {
  buildingsEnabled = event.target.checked;
  buildingGroup.visible = buildingsEnabled;
  if (buildingsEnabled && !buildingsLoaded && current.zoom >= 14) loadBuildings(current, serial);
});
document.querySelector('#shadows').addEventListener('change', event => {
  shadowEnabled = event.target.checked;
  configureShadows(current.zoom);
});
document.querySelector('#snapshot').addEventListener('click', () => {
  // Synchronously render before reading the framebuffer; don't need to retain
  // the drawing buffer during the normal animation loop.
  try {
    renderer.render(scene, camera);
    const anchor = document.createElement('a');
    anchor.download = `mauritius-${paletteName}-${Date.now()}.png`;
    anchor.href = renderer.domElement.toDataURL('image/png');
    anchor.click();
  } catch (error) {
    console.error(error);
    setStatus('Cannot export screenshot in this browser. Check WebGL and cross-origin tile permissions.');
  }
});

window.addEventListener('resize', () => {
  setCameraFrame(camera, frameHeight, window.innerWidth / window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  oceanTime.value += Math.min(clock.getDelta(), 0.05);
  controls.update();
  updatePlaceMarkers();
  renderer.render(scene, camera);
}
recolor(DEFAULT_PALETTE);
animate();
goTo(current);
