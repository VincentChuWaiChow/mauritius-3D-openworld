import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { classifyBuilding, parseHeight, idVariation } from './palettes.js';

const RADIUS = 6378137;
export function projectLocal(lat, lon, originLat, originLon) {
  return {
    x: (lon - originLon) * Math.PI / 180 * RADIUS * Math.cos(originLat * Math.PI / 180),
    z: -(lat - originLat) * Math.PI / 180 * RADIUS,
  };
}

function signedArea(points) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return sum / 2;
}

function materialPatterns(tags = {}, category) {
  const pattern = {
    default: [0, 7], home: [0, 5], apartments: [1, 4],
    commercial: [1, 6], industrial: [3, 6], heritage: [2, 5],
  }[category] || [0, 7];
  const [wall, roof] = pattern;
  const roofTag = String(tags['roof:material'] || '').toLowerCase();
  const wallTag = String(tags['building:material'] || '').toLowerCase();
  let actualWall = wall, actualRoof = roof;
  if (roofTag.includes('metal') || roofTag.includes('sheet')) actualRoof = 6;
  else if (roofTag.includes('tile')) actualRoof = 5;
  else if (roofTag.includes('concrete') || roofTag.includes('cement')) actualRoof = 4;
  if (wallTag.includes('glass')) actualWall = 1;
  else if (wallTag.includes('brick') || wallTag.includes('stone')) actualWall = 2;
  else if (wallTag.includes('metal')) actualWall = 3;
  return { wall: actualWall, roof: actualRoof };
}

/** One OSM footprint as upward-facing geometry, grounded on its DEM sample. */
function createGeometry(element, origin, sampleElevation, relief, heightScale) {
  const nodes = element.geometry;
  if (!Array.isArray(nodes) || nodes.length < 4) return null;
  const points = nodes.map(({ lat, lon }) => {
    const p = projectLocal(lat, lon, origin.lat, origin.lon);
    return new THREE.Vector2(p.x, -p.z);
  });
  if (Math.abs(signedArea(points)) < 7) return null;
  const category = classifyBuilding(element.tags);
  const shapes = materialPatterns(element.tags, category);
  const shape = new THREE.Shape(points);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: parseHeight(element.tags), bevelEnabled: false,
    curveSegments: 1, steps: 1,
  });
  // +Z extrude becomes +Y, aligned to the 3D terrain's x,z coordinates.
  geo.rotateX(-Math.PI / 2);
  const count = geo.getAttribute('position').count;
  if (count === 0) { geo.dispose(); return null; }

  const center = nodes.reduce((acc, n) => {
    acc.lat += n.lat; acc.lon += n.lon; return acc;
  }, { lat: 0, lon: 0 });
  center.lat /= nodes.length; center.lon /= nodes.length;
  const groundMeters = sampleElevation(center.lat, center.lon);
  const pos = geo.getAttribute('position');
  const groundAttr = new Float32Array(count).fill(groundMeters);
  const structureAttr = new Float32Array(count);
  const patternAttr = new Float32Array(count);
  const faceGroups = geo.groups.map(group => ({
    start: group.start, count: group.count, roof: group.materialIndex === 0,
  }));
  for (let i = 0; i < count; i++) {
    structureAttr[i] = pos.getY(i);
    pos.setY(i, groundMeters * relief + structureAttr[i] * heightScale + .3);
  }
  for (const face of faceGroups) {
    patternAttr.fill(face.roof ? shapes.roof : shapes.wall, face.start, face.start + face.count);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.setAttribute('groundMeters', new THREE.BufferAttribute(groundAttr, 1));
  geo.setAttribute('structureMeters', new THREE.BufferAttribute(structureAttr, 1));
  geo.setAttribute('patternId', new THREE.BufferAttribute(patternAttr, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  return {
    geometry: geo, count, category, faceGroups,
    variation: .88 + idVariation(element.id) * .24,
  };
}

const colorCache = new Map();
function colorFromHex(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));
  return colorCache.get(hex);
}

function paintRanges(mesh, palette) {
  const color = mesh.geometry.getAttribute('color');
  const array = color.array;
  for (const building of mesh.userData.buildingRanges) {
    const choice = palette.buildings[building.category] || palette.buildings.default;
    for (const face of building.faceGroups) {
      const tint = colorFromHex(face.roof ? choice.roof : choice.wall);
      for (let i = building.offset + face.start; i < building.offset + face.start + face.count; i++) {
        const at = i * 3;
        array[at] = Math.min(1, tint.r * building.variation);
        array[at + 1] = Math.min(1, tint.g * building.variation);
        array[at + 2] = Math.min(1, tint.b * building.variation);
      }
    }
  }
  color.needsUpdate = true;
}

/** Merge nearby buildings to maintain a bounded number of draw calls. */
export function createBuildingBatches(elements, origin, palette, material, sampleElevation = () => 0,
  relief = 1, heightScale = 1, batchSize = 150) {
  const meshes = [];
  let pending = [];
  let count = 0;
  const flush = () => {
    if (!pending.length) return;
    const geo = mergeGeometries(pending.map(e => e.geometry), false);
    if (!geo) {
      for (const item of pending) item.geometry.dispose();
      pending = [];
      return;
    }
    let offset = 0;
    const ranges = pending.map(({ geometry, ...rest }) => {
      const range = { ...rest, offset };
      offset += rest.count;
      geometry.dispose();
      return range;
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.userData.buildingRanges = ranges;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    paintRanges(mesh, palette);
    meshes.push(mesh);
    pending = [];
  };

  for (const el of elements || []) {
    if (el.type !== 'way') continue;
    const data = createGeometry(el, origin, sampleElevation, relief, heightScale);
    if (!data) continue;
    pending.push(data);
    count++;
    if (pending.length >= batchSize) flush();
  }
  flush();
  return { meshes, count };
}

export function recolorBuildingBatches(group, palette) {
  for (const mesh of group.children) paintRanges(mesh, palette);
}

export function rescaleBuildingBatches(group, relief, buildingScale) {
  for (const mesh of group.children) {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    const ground = geometry.getAttribute('groundMeters');
    const structure = geometry.getAttribute('structureMeters');
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, ground.getX(i) * relief + structure.getX(i) * buildingScale + .3);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
}
