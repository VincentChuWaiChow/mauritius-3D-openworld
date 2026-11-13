import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFragmentShader, seaFragmentShader } from '../src/map-shaders.js';

test('custom fragment shaders use renderer-provided color declarations exactly once', () => {
  for (const shader of [mapFragmentShader, seaFragmentShader]) {
    assert.doesNotMatch(shader, /#include <(?:tonemapping|colorspace)_pars_fragment>/,
      'Three.js injects these declarations before ShaderMaterial source');
    assert.match(shader, /#include <tonemapping_fragment>/);
    assert.match(shader, /#include <colorspace_fragment>/);
    assert.match(shader, /#include <fog_pars_fragment>/);
    assert.match(shader, /#include <fog_fragment>/);
  }
});
