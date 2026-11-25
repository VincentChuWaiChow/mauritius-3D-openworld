export const refreshMs = 8 * 60_000;
export const congestionColors = Object.freeze({
  low: '#16865c', moderate: '#e5ac25', heavy: '#e86c29', severe: '#bd283f', closed: '#842476'
});

export function normalizeTrafficToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  return /^pk\.\S+$/.test(token) ? token : '';
}

export function trafficTile([lon, lat], zoom = 14) {
  const count = 2 ** zoom;
  const x = Math.floor((lon + 180) / 360 * count);
  const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * count);
  return {x, y, zoom, key: [zoom, x, y].join('/')};
}

export function trafficLines(layer, {x, y, zoom}) {
  const lines = [];
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer.feature(i);
    const {closed, congestion, structure} = feature.properties;
    const level = closed === 'yes' ? 'closed' : congestion;
    if (feature.type !== 2 || !Object.hasOwn(congestionColors, level) || structure === 'tunnel') continue;
    const geometry = feature.toGeoJSON(x, y, zoom).geometry;
    const paths = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    for (const points of paths) if (points.length >= 2) lines.push({level, points});
  }
  return lines;
}

export async function readTraffic(tile, token, signal) {
  const url = new URL('https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/' + tile.key + '.mvt');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, {signal});
  if (response.status === 204) return [];
  if (!response.ok) throw Error('Traffic unavailable (HTTP ' + response.status + ')');
  const bytes = new Uint8Array(await response.arrayBuffer());
  signal?.throwIfAborted();
  if (!bytes.length) return [];
  const [{VectorTile}, {PbfReader}] = await Promise.all([
    import('@mapbox/vector-tile'), import('pbf')
  ]);
  signal?.throwIfAborted();
  const data = new VectorTile(new PbfReader(bytes));
  return trafficLines(data.layers.traffic, tile);
}
