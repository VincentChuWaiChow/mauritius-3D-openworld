import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, classifyBuilding, parseHeight, idVariation } from '../src/palettes.js';

test('all rendering palettes contain semantic colors and consistent building categories', () => {
  for (const p of Object.values(PALETTES)) {
    for (const key of ['sky','fog','ocean','land','vegetation','roads','sun','accent']) {
      assert.match(p[key], /^#[\da-f]{6}$/i);
    }
    for (const key of ['default','home','apartments','commercial','industrial','heritage']) {
      assert.match(p.buildings[key].roof, /^#[\da-f]{6}$/i);
      assert.match(p.buildings[key].wall, /^#[\da-f]{6}$/i);
    }
  }
});
test('building height supports meters, feet, storeys and estimated fallback', () => {
  assert.equal(parseHeight({ height: '12 m' }), 12);
  assert.ok(Math.abs(parseHeight({ height: '30 ft' }) - 9.144) < 0.001);
  assert.equal(parseHeight({ 'building:levels': '4' }), 12.8);
  assert.equal(parseHeight({ building: 'industrial' }), 8);
  assert.equal(parseHeight({}), 5.5);
});
test('building types receive semantic color families', () => {
  assert.equal(classifyBuilding({ building: 'apartments' }), 'apartments');
  assert.equal(classifyBuilding({ building: 'warehouse' }), 'industrial');
  assert.equal(classifyBuilding({ building: 'church' }), 'heritage');
  assert.equal(classifyBuilding({ shop: 'supermarket' }), 'commercial');
});
test('id-based color variation is repeatable and bounded', () => {
  for (const id of [1, 45, 237000, 1e10]) {
    assert.ok(idVariation(id) >= 0 && idVariation(id) < 1);
    assert.equal(idVariation(id), idVariation(id));
  }
});
