/** Camera framing derived from mapped OSM building footprints.
 * This module never creates fictional streets or structures.
 * Input [lon, lat] coordinates are transformed with the same map projection
 * used by the rendered buildings; all returned distances are in world units.
 */
export function selectBuildingCluster(region, project) {
  const fallback = project(region.center);
  const points = (region.buildings || []).map(building => {
    const ring = building.points || [];
    const count = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
      ? ring.length - 1 : ring.length;
    if (count < 3) return null;
    let x = 0, z = 0;
    for (let i = 0; i < count; i++) {
      const p = project(ring[i]); x += p.x; z += p.z;
    }
    return {x:x/count, z:z/count, id:building.id};
  }).filter(Boolean);
  if (!points.length) return {x:fallback.x, z:fallback.z, count:0, source:'region-center'};
  // The sample is sparse. Pick an actual OSM building cluster with the most
  // neighbors, penalizing distant suburbs to preserve each city's identity.
  const radius = 23; // 230 m radius at the project's 10 m/world-unit scale.
  let best = null;
  for (const candidate of points) {
    const nearby = points.filter(p => Math.hypot(p.x-candidate.x,p.z-candidate.z) <= radius);
    const d = Math.hypot(candidate.x-fallback.x,candidate.z-fallback.z);
    const score = nearby.length - Math.max(0,d-25)*.055;
    if (!best || score > best.score || (score === best.score && candidate.id < best.id)) {
      // Mean center minimizes the risk of the chosen building sitting near the edge.
      best = {x:nearby.reduce((n,p)=>n+p.x,0)/nearby.length,
        z:nearby.reduce((n,p)=>n+p.z,0)/nearby.length,
        count:nearby.length, score, id:candidate.id};
    }
  }
  return {x:best.x, z:best.z, count:best.count, source:'osm-buildings'};
}

export function cameraSpan(region, mode='close') {
  const district = region.span / 18;
  if (mode === 'district') return district;
  if (mode === 'building') return Math.min(15, district / 4);
  // Roughly 300–400 m vertically: buildings are visible without invented density.
  return Math.max(28, Math.min(40, region.span / 52));
}
