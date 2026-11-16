import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { projectLocal } from "./buildings.js";
import { DESTINATIONS, FEATURED } from "./experience.js";

// A local scene is intentionally bounded; outside it the overview remains the way to travel.
export function bundledKey(place) {
  if (place === DESTINATIONS.mauritius) return "coastline";
  return FEATURED.find(key => Math.abs(place.lat - DESTINATIONS[key].lat) < .009
    && Math.abs(place.lon - DESTINATIONS[key].lon) < .009) || null;
}

export function localBounds(bounds, origin, margin = 350) {
  const nw = projectLocal(bounds[2], bounds[1], origin.lat, origin.lon);
  const se = projectLocal(bounds[0], bounds[3], origin.lat, origin.lon);
  return { minX: nw.x + margin, maxX: se.x - margin, minZ: nw.z + margin, maxZ: se.z - margin };
}

function polygon(points, origin, height) {
  const shape = new THREE.Shape(points.map(p => {
    const v = projectLocal(p.lat, p.lon, origin.lat, origin.lon);
    return new THREE.Vector2(v.x, -v.z);
  }));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height, 0);
  return geometry.toNonIndexed();
}

function ribbon(points, origin, width, height) {
  const vertices = [];
  for (let i = 1; i < points.length; i++) {
    const a = projectLocal(points[i-1].lat, points[i-1].lon, origin.lat, origin.lon);
    const b = projectLocal(points[i].lat, points[i].lon, origin.lat, origin.lon);
    const length = Math.hypot(b.x-a.x, b.z-a.z);
    if (length < .1) continue;
    const dx = -(b.z-a.z) / length * width/2, dz = (b.x-a.x) / length * width/2;
    vertices.push(a.x+dx,height,a.z+dz, b.x+dx,height,b.z+dz, a.x-dx,height,a.z-dz,
      a.x-dx,height,a.z-dz, b.x+dx,height,b.z+dz, b.x-dx,height,b.z-dz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function inside(point, ring) {
  let result = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const a=ring[i], b=ring[j];
    if ((a.lat>point.lat)!==(b.lat>point.lat) && point.lon<(b.lon-a.lon)*(point.lat-a.lat)/(b.lat-a.lat)+a.lon) result=!result;
  }
  return result;
}

/** Label-free real coast, roads and footprints. Flat ground is deliberate and disclosed. */
export function createVectorScene(coast, elements, origin, palette) {
  const group = new THREE.Group();
  const parts = { land: [], vegetation: [], lagoon: [], roads: [], roadEdge: [] };
  for (const ring of coast.rings) parts.land.push(polygon(ring, origin, 0));
  const trees = [];
  for (const el of elements) {
    const tags = el.tags || {};
    if (el.type === "node" && tags.natural === "tree") { trees.push(el); continue; }
    if (!el.geometry) continue;
    const points=el.geometry;
    if (tags.highway && !["proposed", "construction", "steps"].includes(tags.highway)) {
      const width = { motorway: 15, trunk: 13, primary: 11, secondary: 9, tertiary: 8, residential: 6, service: 4, footway: 2, path: 2 }[tags.highway] || 5;
      parts.roads.push(ribbon(points, origin, width, .35));
      parts.roadEdge.push(ribbon(points, origin, width+2, .25));
    }
    const first=points[0], last=points.at(-1);
    if (points.length<4 || first.lat!==last.lat || first.lon!==last.lon || tags.building) continue;
    const green = ["wood", "scrub"].includes(tags.natural) || ["forest", "grass", "recreation_ground"].includes(tags.landuse) || ["park", "garden"].includes(tags.leisure);
    const water = tags.natural === "water" || tags.water || tags.waterway === "riverbank";
    if (green) parts.vegetation.push(polygon(points, origin, .12));
    if (water) parts.lagoon.push(polygon(points, origin, .16));
    // Decorative low-poly trees are confined to mapped green spaces, not invented POIs.
    if (green && trees.length < 200) {
      const minLat=Math.min(...points.map(p=>p.lat)), maxLat=Math.max(...points.map(p=>p.lat));
      const minLon=Math.min(...points.map(p=>p.lon)), maxLon=Math.max(...points.map(p=>p.lon));
      for (let i=0;i<18 && trees.length<200;i++) {
        const lat=minLat+(maxLat-minLat)*((i*.618033+0.2)%1);
        const lon=minLon+(maxLon-minLon)*((i*.414214+0.3)%1);
        const p={lat,lon}, v=projectLocal(lat,lon,origin.lat,origin.lon);
        if (Math.hypot(v.x,v.z)<1800 && inside(p,points)) trees.push(p);
      }
    }
  }
  for (const [role, geometries] of Object.entries(parts)) {
    if (!geometries.length) continue;
    // ShapeGeometry includes UVs; ribbons do not. Each role has homogeneous attributes.
    const geometry=mergeGeometries(geometries);
    geometries.forEach(g=>g.dispose());
    const material=new THREE.MeshBasicMaterial({ color: palette[role] || palette.vegetation, side: THREE.DoubleSide });
    const mesh=new THREE.Mesh(geometry, material);
    mesh.userData.colorRole=role;
    group.add(mesh);
    if (role === "land") {
      const shadow=new THREE.Mesh(geometry.clone(), new THREE.ShadowMaterial({color: "#173c32", opacity: .25, depthWrite: false}));
      shadow.position.y=.18; shadow.receiveShadow=true; shadow.userData.shadow=true;
      group.add(shadow);
    }
  }
  if (trees.length) {
    for (const [geometry, color, height] of [[new THREE.CylinderGeometry(1.4,2,12,5),"#8d7950",6], [new THREE.ConeGeometry(8,25,5),palette.vegetation,22]]) {
      const mesh=new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({color,flatShading:true}),trees.length);
      const matrix=new THREE.Matrix4();
      trees.forEach((tree,i)=>{const p=projectLocal(tree.lat,tree.lon,origin.lat,origin.lon);matrix.makeTranslation(p.x,height,p.z);mesh.setMatrixAt(i,matrix);});
      mesh.castShadow=true;
      if(height===22) mesh.userData.colorRole="vegetation";
      group.add(mesh);
    }
  }
  return group;
}

export function recolorVectorScene(group, palette, shadows) {
  for (const child of group.children) {
    if (child.userData.colorRole) child.material.color.set(palette[child.userData.colorRole] || palette.vegetation);
    if (child.userData.shadow) child.visible=shadows;
  }
}

/** Geometry/material disposal alone does not free InstancedMesh instance buffers. */
export function disposeGroup(group, disposeMaterials = false) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.dispose?.();
    child.geometry?.dispose();
    if (disposeMaterials) {
      if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
      else child.material?.dispose();
    }
  }
}
