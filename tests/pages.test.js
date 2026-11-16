import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

test('production assets and textures work under the GitHub Pages project path', async () => {
  const base = '/mauritius-3D-openworld/';
  const outDir = await mkdtemp(join(tmpdir(), 'mauritius-pages-'));
  try {
    await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    assert.ok(assets.some(asset => asset.endsWith('.js')), 'JavaScript entry exists');
    assert.ok(assets.some(asset => asset.endsWith('.css')), 'stylesheet exists');
    for (const asset of assets) {
      assert.ok(asset.startsWith(base), `${asset} must stay under the project path`);
      assert.ok((await stat(join(outDir, asset.slice(base.length)))).isFile());
    }
    const script = assets.find(asset => asset.endsWith('.js'));
    const javascript = await readFile(join(outDir, script.slice(base.length)), 'utf8');
    assert.doesNotMatch(javascript, /href=["']\/textures\//,
      'the texture-sheet link must not escape to the domain root');
    for (const scene of ['coastline', 'portLouis', 'grandBaie', 'mahebourg', 'tamarin']) {
      const snapshot = JSON.parse(await readFile(join(outDir, 'data', `${scene}.json`), 'utf8'));
      assert.ok(snapshot.license.includes('odbl'), `${scene} is published with its data licence`);
    }
    assert.ok(javascript.includes(`${base}data/`), 'scene URLs retain the Pages project base');
    for (const texture of ['surface-atlas.png', 'building-atlas.png', 'material-reference-sheet.png']) {
      assert.ok((await stat(join(outDir, 'textures', texture))).isFile(), `${texture} is published`);
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
