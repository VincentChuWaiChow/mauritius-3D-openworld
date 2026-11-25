import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const panel=html.split('<div id="layers-panel" hidden>')[1]?.split('<div id="flow-credit"')[0];

test('layer tiles retain all eight native checkbox bindings and initial states',()=>{
  assert.ok(panel);
  const grid=panel.match(/<div class="layer-grid" role="group" aria-label="Map layers">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(grid,'Layer choices have a named group');
  const labels=[...grid.matchAll(/<label class="layer-tile"><input type="checkbox" ([^>]+)><span>([^<]+)<\/span><\/label>/g)];
  assert.deepEqual(labels.map(([,attrs,text])=>[attrs,text]),[
    ['id="weather-enabled"','Regional weather simulation'],
    ['id="terrain-enabled" checked','Real DEM terrain (online)'],
    ['data-layer="buildings" checked','Buildings'],
    ['data-layer="roads" checked','Roads'],
    ['data-layer="nature" checked','Trees &amp; parks'],
    ['data-layer="traffic" checked','Simulated cars'],
    ['id="flow-enabled"','Mapbox traffic · centre tile'],
    ['id="labels-check" checked','Place labels'],
  ]);
  assert.equal((panel.match(/type="checkbox"/g)||[]).length,8);
});

test('layer metadata and full-width adjustment controls remain outside the tile grid',()=>{
  const gridEnd=panel.indexOf('</div>');
  for(const id of ['weather-status','flow-status','height','height-value','panel-transparency','transparency-value']){
    assert.equal((panel.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
    assert.ok(panel.indexOf(`id="${id}"`)>gridEnd,id+' must follow the layer grid');
  }
  assert.ok(panel.indexOf('id="theme"')<panel.indexOf('class="layer-grid"'));
  for(const attribution of ['https://open-meteo.com/','https://creativecommons.org/licenses/by/4.0/'])assert.ok(panel.includes(attribution));
});

test('runtime Mapbox token form is masked, labeled and outside the checkbox grid',()=>{
  assert.match(panel,/<details class="traffic-token-settings"><summary>Mapbox public token<\/summary>/);
  assert.match(panel,/<label for="traffic-token">Your public token<\/label>/);
  const input=panel.match(/<input id="traffic-token"[^>]*>/)?.[0];
  assert.ok(input);assert.match(input,/type="password"/);assert.match(input,/autocomplete="off"/);
  assert.doesNotMatch(input,/\bname=/,'Token must not be serialized by native form navigation');
  assert.match(panel,/id="traffic-token-status" role="status"/);
  assert.match(panel,/id="clear-traffic-token" type="button"/);
});
