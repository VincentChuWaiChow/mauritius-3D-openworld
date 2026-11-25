import {RepeatWrapping, SRGBColorSpace, TextureLoader} from 'three';

export function surfaceTextures(base, onChange, onFailure) {
  const loader = new TextureLoader();
  const cache = new Map();
  return function get(name) {
    const cached = cache.get(name);
    if (cached) return cached;

    const texture = loader.load(`${base}textures/${name}.png`, () => {
      if (cache.get(name) === texture) onChange();
    }, undefined, () => {
      if (cache.get(name) !== texture) return;
      cache.delete(name);
      onFailure(texture);
      texture.dispose();
      onChange();
    });
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 4;
    cache.set(name, texture);
    return texture;
  };
}
