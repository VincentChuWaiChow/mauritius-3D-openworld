import test from 'node:test';
import assert from 'node:assert/strict';
import {PbfWriter} from 'pbf';
import {readTraffic, trafficTile, trafficLines, refreshMs} from '../src/explorer/traffic.js';

const tile = trafficTile([57.50, -20.16]);
test('decode a directional congestion line from a binary vector tile', async t => {
  const pbf = new PbfWriter();
  pbf.writeMessage(3, (_, layer) => {
    layer.writeVarintField(15, 2);
    layer.writeStringField(1, 'traffic');
    layer.writeStringField(3, 'congestion');
    layer.writeMessage(4, (_, value) => value.writeStringField(1, 'heavy'));
    layer.writeMessage(2, (_, feature) => {
      feature.writePackedVarint(2, [0, 0]);
      feature.writeVarintField(3, 2);
      feature.writePackedVarint(4, [9, 200, 200, 10, 60, 80]);
    });
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(pbf.finish()));
  const [line] = await readTraffic(tile, 'fixture');
  assert.equal(line.level, 'heavy');
  assert.equal(line.points.length, 2);
  assert.ok(Math.abs(line.points[0][0]-57.5) < .03);
  assert.ok(Math.abs(line.points[0][1]+20.16) < .03);
});

test('empty coverage and provider errors stay distinguishable', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null,{status:204}));
  assert.deepEqual(await readTraffic(tile, 'fixture'), []);
  fetch.mock.mockImplementation(async () => new Response(null,{status:403}));
  await assert.rejects(readTraffic(tile, 'fixture'), /403/);
});

test('traffic uses the expected centre tile and eight-minute refresh interval', () => {
  assert.deepEqual(trafficTile([0, 0], 0), {x: 0, y: 0, zoom: 0, key: '0/0/0'});
  assert.equal(tile.zoom, 14);
  assert.equal(tile.key, `${tile.zoom}/${tile.x}/${tile.y}`);
  assert.equal(refreshMs, 480_000);
});

test('decoding preserves opposing directions and multipart lines while filtering tunnels', () => {
  const east = [[57.5, -20.16], [57.51, -20.16]], west = [...east].reverse();
  const feature = (properties, coordinates, type = 2, shape = 'LineString') => ({
    type, properties,
    toGeoJSON(x, y, zoom) {
      assert.deepEqual({x, y, zoom}, {x: tile.x, y: tile.y, zoom: tile.zoom});
      return {geometry: {type: shape, coordinates}};
    }
  });
  const features = [
    feature({congestion: 'heavy'}, east),
    feature({congestion: 'low'}, west),
    feature({closed: 'yes', congestion: 'low'}, [east, west], 2, 'MultiLineString'),
    feature({congestion: 'heavy', structure: 'tunnel'}, east),
    feature({congestion: 'unknown'}, east),
    feature({congestion: 'low'}, east, 1),
    feature({congestion: 'low'}, [east[0]])
  ];
  assert.deepEqual(trafficLines({length: features.length, feature: i => features[i]}, tile), [
    {level: 'heavy', points: east}, {level: 'low', points: west},
    {level: 'closed', points: east}, {level: 'closed', points: west}
  ]);
  assert.deepEqual(trafficLines(undefined, tile), []);
});

test('requests use the tile URL, encode the public token and forward cancellation', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, 'https://api.mapbox.com');
    assert.equal(url.pathname, `/v4/mapbox.mapbox-traffic-v1/${tile.key}.mvt`);
    assert.equal(url.searchParams.get('access_token'), 'pk.fixture+/?');
    assert.equal(options.signal, controller.signal);
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(readTraffic(tile, 'pk.fixture+/?', controller.signal), {name: 'AbortError'});
});

test('a tile without the traffic layer is empty coverage', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array()));
  assert.deepEqual(await readTraffic(tile, 'fixture'), []);
});

test('malformed binary data is an error rather than empty coverage', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([255])));
  await assert.rejects(readTraffic(tile, 'fixture'));
});
