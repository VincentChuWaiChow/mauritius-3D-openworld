import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const builder = fileURLToPath(new URL('../scripts/build-road-index.py', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const road = (id, points) => ({ id, kind: 'residential', points });
const way = (id, name, extra = {}) => ({ type: 'way', id, tags: { highway: 'residential', name, ...extra } });

function fixture(t, { elements, roads, places } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'road-index-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tiles = join(dir, 'tiles');
  mkdirSync(tiles);
  const data = {
    metadata: { osm3s: { timestamp_osm_base: '2026-11-23T00:00:00Z' }, elements: elements ?? [way(10, 'Main Road')] },
    index: { source: 'OSM fixture', license: 'ODbL-1.0', attribution: 'OSM', input_sha256: 'original-extract', keys: ['1_2'] },
    tile: { roads: roads ?? [road(10, [[57.5, -20.1], [57.501, -20.1]])], buildings: [{ id: 99, points: [[0, 0]] }] },
    places: { input_sha256: 'places-extract', places: places ?? [
      { id: 'n1', name: 'Actual Village', kind: 'village', center: [57.5, -20.1] },
      { id: 'n2', name: 'Closer Hotel', kind: 'hotel', center: [57.5005, -20.1] },
    ] },
  };
  const write = () => {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(data.metadata));
    writeFileSync(join(tiles, 'index.json'), JSON.stringify(data.index));
    writeFileSync(join(tiles, '1_2.json'), JSON.stringify(data.tile));
    writeFileSync(join(dir, 'places.json'), JSON.stringify(data.places));
  };
  write();
  const run = (out = 'out', options = []) => spawnSync('python3', [builder,
    '--metadata', join(dir, 'metadata.json'), '--tiles', tiles, '--places', join(dir, 'places.json'),
    '--out', join(dir, out), '--source-url', 'https://example.org/actual-overpass-query', ...options], { encoding: 'utf8' });
  const read = (out = 'out') => JSON.parse(readFileSync(join(dir, out, 'index.json'), 'utf8'));
  const paths = (record, out = 'out') => JSON.parse(readFileSync(join(dir, out, record.bucket), 'utf8')).roads[record.id].paths;
  return { dir, tiles, data, write, run, read, paths };
}

test('road builder joins numeric way IDs, omits unnamed/missing metadata and records exact provenance', t => {
  const f = fixture(t, { elements: [way('10', ' Main Road ', { ref: 'A1', 'name:fr': 'Rue Principale', alt_name: 'Old Road' }),
    way(11, ''), { type: 'node', id: 12, tags: { name: 'Never join a node' } }, way(999, 'No geometry')],
  roads: [10, 11, 12].map(id => road(id, [[57.5, -20.1], [57.501, -20.1]])) });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const index = f.read();
  assert.deepEqual(index.coverage, { mappedWays: 3, matchedNamedWays: 1, unmatchedWays: 1, roadCount: 1 });
  const record = index.roads[0];
  assert.equal(record.id, 'r10');
  assert.equal(record.name, 'Main Road');
  assert.equal(record.kind, 'road');
  assert.equal(record.locality, 'Near Actual Village');
  assert.match(record.aliases, /A1/);
  assert.match(record.aliases, /Rue Principale/);
  assert.deepEqual(record.wayIds, [10]);
  assert.equal(index.license, 'ODbL-1.0');
  assert.equal(index.source.sha256, sha256(readFileSync(join(f.dir, 'metadata.json'))));
  assert.equal(index.source.geometry.indexSha256, sha256(readFileSync(join(f.tiles, 'index.json'))));
  assert.equal(index.source.geometry.inputSha256, 'original-extract');
  assert.equal(index.source.places.sha256, sha256(readFileSync(join(f.dir, 'places.json'))));
  const tileHash = sha256(readFileSync(join(f.tiles, '1_2.json')));
  assert.equal(index.source.geometry.tileFilesSha256, sha256(`1_2.json\0${tileHash}\n`));
  assert.equal(index.source.timestamp, '2026-11-23T00:00:00Z');
  const readme = readFileSync(join(f.dir, 'out', 'README.md'), 'utf8');
  assert.match(readme, /1 matched unnamed ways omitted/);
  assert.match(readme, /1 ways absent from metadata omitted/);
  assert.match(readme, /not an official address/);
});

test('road builder groups only shared-vertex equal-name/locality/grade components with minimum way ID', t => {
  const a = [57.5, -20.1], b = [57.501, -20.1], c = [57.502, -20.1];
  const f = fixture(t, { elements: [way(20, 'MAIN Road'), way(10, 'Main Road'), way(30, 'Main Road'), way(40, 'Other Road')],
    roads: [road(20, [b, c]), road(10, [a, b]), road(30, [[57.51, -20.1], [57.511, -20.1]]), road(40, [b, c])] });
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.read().roads.map(r => [r.id, r.wayIds]), [['r10', [10, 20]], ['r30', [30]], ['r40', [40]]]);
  assert.deepEqual(f.paths(f.read().roads[0]), [[a, b], [b, c]], 'fragments remain separate, no connecting segment');
});

test('road builder separates layer, bridge, and tunnel tags at coincident vertices', t => {
  const f = fixture(t, { elements: [way(10, 'Main Road'), way(11, 'Main Road', { layer: '0.0', bridge: 'no', tunnel: 'no' }),
    way(12, 'Main Road', { layer: '1' }), way(13, 'Main Road', { bridge: 'yes' }),
    way(14, 'Main Road', { tunnel: 'yes' }), way(15, 'Main Road', { layer: '-1' })],
  roads: [10, 11, 12, 13, 14, 15].map(id => road(id, [[57.5, -20.1], [57.501, -20.1]])) });
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.read().roads.map(r => r.wayIds), [[10, 11], [12], [13], [14], [15]]);
});

test('road builder separates same-name connected ways with different nearest mapped settlements', t => {
  const f = fixture(t, { elements: [way(10, 'Main Road'), way(11, 'Main Road')],
    roads: [road(10, [[57.5, -20.1], [57.51, -20.1]]), road(11, [[57.51, -20.1], [57.52, -20.1]])],
    places: [{ id: 'a', kind: 'town', name: 'West', center: [57.5, -20.1] },
      { id: 'b', kind: 'city', name: 'East', center: [57.52, -20.1] }] });
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.read().roads.map(r => r.locality), ['Near West', 'Near East']);
});

test('road builder preserves exact source fragments and all input bytes, deduplicating only exact/reversed paths', t => {
  const a = [57.5, -20.1], b = [57.501, -20.1], c = [57.502, -20.1], nearB = [57.501001, -20.1];
  const source = [[a, b], [b, a], [a, b], [b, c], [nearB, c]];
  const f = fixture(t, { roads: source.map(points => road(10, points)) });
  const originals = ['index.json', '1_2.json'].map(file => [file, readFileSync(join(f.tiles, file))]);
  assert.equal(f.run().status, 0);
  const paths = f.paths(f.read().roads[0]);
  assert.equal(paths.length, 3);
  for (const path of paths) assert(source.some(original => JSON.stringify(original) === JSON.stringify(path)));
  for (const [file, original] of originals) assert.deepEqual(readFileSync(join(f.tiles, file)), original);
});

test('road builder anchors halfway along longest original path with latitude-aware length, bounds cover all paths', t => {
  // At 60 degrees latitude a .01 longitude segment is shorter than .006 latitude.
  const longest = [[57.5, 60], [57.5, 60.006]];
  const f = fixture(t, { roads: [road(10, [[57.5, 60], [57.51, 60]]), road(10, longest)] });
  assert.equal(f.run().status, 0);
  const record = f.read().roads[0];
  assert.equal(record.center[0], 57.5);
  assert(Math.abs(record.center[1] - 60.003) < 1e-10);
  assert.deepEqual(record.bounds, [57.5, 60, 57.51, 60.006]);
  assert(f.paths(record).some(path => record.center[0] === path[0][0] && record.center[1] >= path[0][1] && record.center[1] <= path[1][1]));
});

test('road builder deterministic files and 32 bounded buckets survive metadata element order changes', t => {
  const f = fixture(t, { elements: [way(21, 'École Road', { ref: 'B2', alt_name: 'School Road' }), way(10, 'Main Road')],
    roads: [road(21, [[57.6, -20.1], [57.601, -20.1]]), road(10, [[57.5, -20.1], [57.501, -20.1]])] });
  assert.equal(f.run('out-a').status, 0);
  assert.equal(f.run('out-b').status, 0);
  const files = readdirSync(join(f.dir, 'out-a'));
  assert.equal(files.filter(file => /^geometry-\d{2}\.json$/.test(file)).length, 32);
  assert.equal(files.length, 34);
  for (const file of files) assert.deepEqual(readFileSync(join(f.dir, 'out-a', file)), readFileSync(join(f.dir, 'out-b', file)));
  const first = f.read('out-a');
  for (const record of first.roads) assert.equal(record.bucket, `geometry-${String(Number(record.id.slice(1)) % 32).padStart(2, '0')}.json`);
  f.data.metadata.elements.reverse();
  f.write();
  assert.equal(f.run('out-c').status, 0);
  assert.deepEqual(f.read('out-c').roads, first.roads, 'source hash changes but output records remain stable');
});

test('road builder refuses missing timestamp, incomplete source, conflicting IDs, invalid geometry, or invented locality', t => {
  for (const scenario of ['timestamp', 'remark', 'conflict', 'geometry', 'locality']) {
    const f = fixture(t);
    if (scenario === 'timestamp') delete f.data.metadata.osm3s;
    if (scenario === 'remark') f.data.metadata.remark = 'runtime error: query timed out';
    if (scenario === 'conflict') f.data.metadata.elements.push(way(10, 'Conflicting Road'));
    if (scenario === 'geometry') f.data.tile.roads[0].points.push([null, -20]);
    if (scenario === 'locality') f.data.places.places = [{ name: 'Hotel', kind: 'hotel', center: [57.5, -20.1] }];
    f.write();
    const result = f.run();
    assert.notEqual(result.status, 0, scenario);
    assert.match(result.stderr, /Road index build failed:/);
    assert(!readdirSync(f.dir).includes('out'), 'invalid input must not create output');
  }
});

test('road builder accepts an explicit supplied source timestamp without fabricating one', t => {
  const f = fixture(t);
  delete f.data.metadata.osm3s;
  f.write();
  const result = f.run('out', ['--source-timestamp', '2026-11-22T12:00:00Z']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.read().source.timestamp, '2026-11-22T12:00:00Z');
});

test('road builder preserves supplied exact acquisition query in index and README provenance', t => {
  const f = fixture(t);
  const query = '[out:json];way["highway"]["name"](-20.56,57.18,-19.94,57.85);out tags;';
  const result = f.run('out', ['--source-query', query]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.read().source.query, query);
  assert.equal(f.read().source.requestMethod, 'POST');
  assert(readFileSync(join(f.dir, 'out', 'README.md'), 'utf8').includes(query));
});
