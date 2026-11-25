import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

test('both renderer entry points use the supported soft PCF shadow mode',()=>{
  for(const file of ['../src/main.js','../src/explorer/app.js']){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(source,/renderer\.shadowMap\.type\s*=\s*THREE\.PCFShadowMap/);
    assert.doesNotMatch(source,/THREE\.PCFSoftShadowMap/);
  }
});
