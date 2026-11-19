/** WGS84 local meter projection, represented in 10-meter Three.js units.
 * This geographic reference is NOT a global projected CRS. It is sufficiently
 * local for Mauritius; use an official projected CRS for legal/survey work.
 */
export const ORIGIN = Object.freeze({ lon: 57.55, lat: -20.25 });
export const METERS_PER_WORLD_UNIT = 10;
const RADIANS = Math.PI / 180;
const A = 6378137.0;
const ECC2 = 6.69437999014e-3;
const originMeridian = meridianArc(ORIGIN.lat);
function meridianArc(lat) {
  const f=lat*RADIANS, e2=ECC2,e4=e2*e2,e6=e4*e2;
  return A*((1-e2/4-3*e4/64-5*e6/256)*f
    -(3*e2/8+3*e4/32+45*e6/1024)*Math.sin(2*f)
    +(15*e4/256+45*e6/1024)*Math.sin(4*f)
    -(35*e6/3072)*Math.sin(6*f));
}
function eastMetersPerRadian(lat) {
  const phi=lat*RADIANS;
  return A/Math.sqrt(1-ECC2*Math.sin(phi)**2)*Math.cos(phi);
}
/** Input OSM [longitude, latitude], output local x/east, z/south. */
export function project([lon,lat]) {
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>85) throw new RangeError('Invalid WGS84 coordinates');
  return {x:(lon-ORIGIN.lon)*RADIANS*eastMetersPerRadian(lat)/METERS_PER_WORLD_UNIT,
    z:-(meridianArc(lat)-originMeridian)/METERS_PER_WORLD_UNIT};
}
/** Inverse, for geolocated selection and terrain sampling. */
export function unproject({x,z}) {
  const northArc=originMeridian-z*METERS_PER_WORLD_UNIT;
  let lat=ORIGIN.lat-z*METERS_PER_WORLD_UNIT/110700;
  for(let i=0;i<5;i++) {
    const err=meridianArc(lat)-northArc;
    const derivative=(meridianArc(lat+.00001)-meridianArc(lat-.00001))/.00002;
    lat-=err/derivative;
  }
  const lon=ORIGIN.lon+x*METERS_PER_WORLD_UNIT/eastMetersPerRadian(lat)/RADIANS;
  return [lon,lat];
}
export function distanceMeters(a,b) {
  const p=project(a),q=project(b);
  return Math.hypot(q.x-p.x,q.z-p.z)*METERS_PER_WORLD_UNIT;
}
