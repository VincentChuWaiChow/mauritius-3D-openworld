import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const panel=html.split('<div id="layers-panel" hidden>')[1]?.split('<div id="flow-credit"')[0];

test('layer tiles retain existing bindings and add the opt-in marine layer',()=>{
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
    ['id="marine-enabled"','Reefs &amp; lagoons'],
  ]);
  assert.equal((panel.match(/type="checkbox"/g)||[]).length,9);
});

test('marine layer discloses partial mapping and illustrative, pausable waves',()=>{
  assert.match(panel,/<div id="marine-details"[^>]*hidden>/);
  assert.match(panel,/id="marine-status" role="status"/);
  assert.match(panel,/<button id="marine-waves" type="button" aria-pressed="true">Pause waves<\/button>/);
  assert.match(panel,/Partial OSM coverage/);
  assert.match(panel,/illustrative, not live sea conditions/);
  assert.match(panel,/href="%BASE_URL%explorer\/marine\/index.json"/);
  assert.match(html,/id="marine-source"[^>]*hidden/);
});

test('layer metadata and full-width adjustment controls remain outside the tile grid',()=>{
  const gridEnd=panel.indexOf('</div>',panel.indexOf('class="layer-grid"'));
  for(const id of ['weather-status','flow-status','height','height-value','panel-transparency','transparency-value']){
    assert.equal((panel.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
    assert.ok(panel.indexOf(`id="${id}"`)>gridEnd,id+' must follow the layer grid');
  }
  assert.ok(panel.indexOf('id="theme"')<panel.indexOf('class="layer-grid"'));
  for(const attribution of ['https://open-meteo.com/','https://creativecommons.org/licenses/by/4.0/'])assert.ok(panel.includes(attribution));
});

test('settings has an explicit close control and a linked disclosure trigger',()=>{
  assert.match(html,/<button id="layers-button"[^>]*aria-controls="layers-panel"/);
  assert.match(panel,/<button id="close-layers" type="button" aria-label="Close layers and style">/);
  assert.ok(panel.indexOf('id="close-layers"')<panel.indexOf('id="theme"'),'Close precedes the scrollable settings');
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
