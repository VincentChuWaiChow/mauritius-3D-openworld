import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latToTile, lonToTile, tileToLat, tileToLon, decodeTerrarium, TerrainCache,
} from '../src/terrain.js';

function nearly(actual, wanted, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - wanted) <= tolerance, `${actual} should be within ${tolerance} of ${wanted}`);
}

test('Terrarium RGB decoding uses 32768 offset and fractional blue channel', () => {
  nearly(decodeTerrarium(128, 0, 0), 0);
  nearly(decodeTerrarium(129, 88, 128), 344.5);
  nearly(decodeTerrarium(127, 255, 0), -1);
});

test('Mercator inverse maps island points without latitude distortion', () => {
  for (const [lat, lon] of [[-20.22,57.52],[-20.44065,57.3739],[-19.7245,63.4272],[-10.42,56.61]]) {
    nearly(tileToLat(latToTile(lat, 12), 12), lat, 1e-10);
    nearly(tileToLon(lonToTile(lon, 12), 12), lon, 1e-10);
  }
});

test('TerrainCache performs bilinear decode and defaults to sea level without DEM', () => {
  const terrain = new TerrainCache();
  terrain.level = 12;
  const lat = -20.22, lon = 57.52, z = 12;
  assert.equal(terrain.sample(lat, lon), 0);
  const tileX = Math.floor(lonToTile(lon, z));
  const tileY = Math.floor(latToTile(lat, z));
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    pixels[i * 4] = 129; pixels[i * 4 + 1] = 80; pixels[i * 4 + 2] = 0;
    pixels[i * 4 + 3] = 255;
  }
  terrain.tiles.set(terrain.key(z,tileX,tileY), { data: pixels, width:4, height:4 });
  nearly(terrain.sample(lat,lon), 336);
});

test('TerrainCache selects only visible DEM parent tiles for high-detail raster views', async () => {
  const terrain = new TerrainCache();
  const received = [];
  terrain.load = async (z,x,y) => { received.push(`${z}/${x}/${y}`); return {}; };
  const result = await terrain.prime([{x:999,y:1200},{x:1000,y:1200},{x:1001,y:1201}], 15);
  assert.equal(terrain.level,12);
  assert.equal(result.requested,2);
  assert.equal(result.succeeded,2);
  assert.equal(new Set(received).size,2);
});

test('overlapping overview and town primes retain their own DEM request level', async () => {
  const terrain = new TerrainCache();
  const received = [];
  const release = [];
  terrain.load = (z, x, y) => {
    received.push([z, x, y]);
    if (received.length <= 4) return new Promise(resolve => release.push(() => resolve({})));
    return Promise.resolve({});
  };
  // Five distinct overview parents exceed the four workers: the final parent
  // is requested only after a concurrent town prime changes the active level.
  const overview = terrain.prime(Array.from({ length: 5 }, (_, x) => ({ x: x * 2, y: 100 })), 11);
  assert.equal(release.length, 4);
  const town = await terrain.prime([{ x: 1000, y: 1200 }], 15);
  assert.deepEqual(town, { succeeded: 1, requested: 1 });
  release.forEach(resolve => resolve());
  assert.deepEqual(await overview, { succeeded: 5, requested: 5 });
  assert.deepEqual(received, [[10, 0, 50], [10, 1, 50], [10, 2, 50], [10, 3, 50], [12, 125, 150], [10, 4, 50]]);
  assert.equal(terrain.level, 12, 'finishing an old prime must not change the active sampling level');
});
