/** Web Mercator elevation sampling from public Mapzen/AWS Terrarium tiles.
 *  No DEM files or OSM raster tiles are bundled or bulk-prefetched.
 *  Each navigation requests only the DEM parents required by the visible map.
 */
const RAD = Math.PI / 180;
const TILE_SIZE = 256;

export function lonToTile(lon, z) { return (lon + 180) / 360 * 2 ** z; }
export function latToTile(lat, z) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return (1 - Math.asinh(Math.tan(clamped * RAD)) / Math.PI) / 2 * 2 ** z;
}
export function tileToLon(x, z) { return x / 2 ** z * 360 - 180; }
export function tileToLat(y, z) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) / RAD; }
export function decodeTerrarium(r, g, b) { return r * 256 + g + b / 256 - 32768; }

function extractRaster(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let done = false;
    const timer = setTimeout(() => finish(new Error('Elevation tile timed out')), 9000);
    function finish(error, data) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      image.onload = null; image.onerror = null;
      if (error) reject(error); else resolve(data);
    }
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('2D canvas unavailable');
        ctx.drawImage(image, 0, 0);
        finish(null, {
          width: canvas.width, height: canvas.height,
          data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        });
      } catch (error) { finish(error); }
    };
    image.onerror = () => finish(new Error('Elevation tile CORS or network failure'));
    image.src = url;
  });
}

export class TerrainCache {
  constructor({ template = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png' } = {}) {
    this.template = template;
    this.tiles = new Map();
    this.pending = new Map();
    this.level = 10;
  }

  key(z, x, y) { return `${z}/${x}/${y}`; }
  async load(z, x, y) {
    const key = this.key(z, x, y);
    if (this.tiles.has(key)) return this.tiles.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const url = this.template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    const task = extractRaster(url).catch(() => null).then(data => {
      this.pending.delete(key);
      this.tiles.set(key, data);
      // A small bounded cache, since images may each consume ~260 KB.
      if (this.tiles.size > 80) this.tiles.delete(this.tiles.keys().next().value);
      return data;
    });
    this.pending.set(key, task);
    return task;
  }

  async prime(mapTiles, zoom) {
    this.level = zoom >= 14 ? 12 : 10;
    const parents = new Map();
    for (const tile of mapTiles) {
      const divisor = 2 ** (zoom - this.level);
      const x = Math.floor(tile.x / divisor);
      const y = Math.floor(tile.y / divisor);
      parents.set(this.key(this.level, x, y), [x, y]);
    }
    const tasks = [...parents.values()];
    let cursor = 0;
    let succeeded = 0;
    const worker = async () => {
      while (cursor < tasks.length) {
        const [x, y] = tasks[cursor++];
        if (await this.load(this.level, x, y)) succeeded++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
    return { succeeded, requested: tasks.length };
  }

  sample(lat, lon, z = this.level) {
    const tx = lonToTile(lon, z);
    const ty = latToTile(lat, z);
    const tileX = Math.floor(tx), tileY = Math.floor(ty);
    const raster = this.tiles.get(this.key(z, tileX, tileY));
    if (!raster) return 0;
    // Pixel centers are offset by half a cell. Clamp inside each tile: DEM
    // resolution is much lower than the high-zoom map, avoiding visible gaps.
    const px = Math.max(0, Math.min(raster.width - 1, (tx - tileX) * raster.width - 0.5));
    const py = Math.max(0, Math.min(raster.height - 1, (ty - tileY) * raster.height - 0.5));
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, raster.width - 1), y1 = Math.min(y0 + 1, raster.height - 1);
    const xMix = px - x0, yMix = py - y0;
    const at = (x, y) => {
      const i = (y * raster.width + x) * 4;
      return decodeTerrarium(raster.data[i], raster.data[i+1], raster.data[i+2]);
    };
    const first = at(x0,y0) * (1-xMix) + at(x1,y0) * xMix;
    const second = at(x0,y1) * (1-xMix) + at(x1,y1) * xMix;
    return Math.max(0, Math.min(1600, first * (1-yMix) + second * yMix));
  }
}
