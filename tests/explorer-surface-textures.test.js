import test from 'node:test';
import assert from 'node:assert/strict';
import {RepeatWrapping,SRGBColorSpace,Texture,TextureLoader} from 'three';
import {surfaceTextures} from '../src/explorer/surface-textures.js';

function fixture(t) {
  const requests=[],events=[];
  t.mock.method(TextureLoader.prototype,'load',function(url,onLoad,_onProgress,onError){
    const texture=new Texture();
    texture.addEventListener('dispose',()=>events.push(['dispose',texture]));
    requests.push({url,loader:this,texture,succeed:()=>onLoad(texture),fail:()=>onError()});
    return texture;
  });
  const get=surfaceTextures('/assets/',()=>events.push(['change']),texture=>events.push(['failure',texture]));
  return {requests,events,get};
}

test('color surfaces share pending and loaded textures with the current color settings',t=>{
  const {get,requests,events}=fixture(t);
  const grass=get('grassland');
  assert.equal(get('grassland'),grass);
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'/assets/textures/grassland.png');
  assert.equal(grass.colorSpace,SRGBColorSpace);
  assert.equal(grass.wrapS,RepeatWrapping);
  assert.equal(grass.wrapT,RepeatWrapping);
  assert.equal(grass.anisotropy,4);
  assert.deepEqual(events,[]);

  requests[0].succeed();
  assert.equal(get('grassland'),grass);
  assert.equal(requests.length,1);
  assert.deepEqual(events,[['change']]);
  assert.notEqual(get('asphalt'),grass);
  assert.equal(requests[1].loader,requests[0].loader);
});

test('failure evicts only that texture, notifies before disposal, and retries only on the next get',t=>{
  const {get,requests,events}=fixture(t);
  const grass=get('grassland'),road=get('asphalt');
  requests[1].succeed();
  events.length=0;
  requests[0].fail();
  assert.deepEqual(events,[['failure',grass],['dispose',grass],['change']]);
  assert.equal(requests.length,2);
  assert.equal(get('asphalt'),road);
  assert.equal(requests.length,2);

  const replacement=get('grassland');
  assert.notEqual(replacement,grass);
  assert.equal(requests.length,3);
  assert.equal(requests[2].url,requests[0].url);
  assert.equal(get('grassland'),replacement);
  requests[2].succeed();
  assert.equal(get('grassland'),replacement);
});

test('late callbacks from an evicted texture cannot notify or invalidate a replacement',t=>{
  const {get,requests,events}=fixture(t);
  get('grassland');
  requests[0].fail();
  const replacement=get('grassland');
  events.length=0;
  requests[0].succeed();
  requests[0].fail();
  assert.deepEqual(events,[]);
  assert.equal(get('grassland'),replacement);
  assert.equal(requests.length,2);
  requests[1].succeed();
  assert.deepEqual(events,[['change']]);
});
