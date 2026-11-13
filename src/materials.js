import * as THREE from 'three';

const TEXTURE_BASE = `${import.meta.env.BASE_URL || '/'}textures/`;

export function loadAtlases() {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const surface = loader.load(`${TEXTURE_BASE}surface-atlas.png`);
  const buildings = loader.load(`${TEXTURE_BASE}building-atlas.png`);
  for (const tex of [surface, buildings]) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return { surface, buildings };
}

/** Standard-lit PBR building material with a custom per-face texture atlas.
 * Pattern selection is a geometry attribute; OSM roof/structure materials
 * override category defaults where tagged. Materials are artistically inferred
 * otherwise and should not be mistaken for a site inspection.
 */
export function createTexturedBuildingMaterial(atlas, palette) {
  const material = new THREE.MeshStandardMaterial({
    map: atlas, color: '#ffffff', vertexColors: true, roughness: .88,
    metalness: .025, flatShading: true,
    emissive: palette.buildingEmissive, emissiveIntensity: .1,
  });
  material.userData.textureStrength = { value: .8 };
  material.userData.illustrated = { value: palette.illustrated ? 1 : 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.uBuildingPatternStrength = material.userData.textureStrength;
    shader.uniforms.uIllustrated = material.userData.illustrated;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute float patternId;
      varying float vPatternId;
      varying vec3 vPatternPosition;
      varying vec3 vPatternNormal;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vPatternId = patternId;
      vPatternPosition = position;
      vPatternNormal = normal;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying float vPatternId;
      varying vec3 vPatternPosition;
      varying vec3 vPatternNormal;
      uniform float uBuildingPatternStrength;
      uniform float uIllustrated;
    `).replace('#include <map_fragment>', `
      #ifdef USE_MAP
        float atlasColumn = mod(floor(vPatternId + .5), 4.0);
        float atlasRow = floor(floor(vPatternId + .5) / 4.0);
        vec3 n = normalize(vPatternNormal);
        // Roofs get overhead tiling. Facades get vertical tile coordinates.
        vec2 uvLocal = abs(n.y) > .52 ? vPatternPosition.xz :
          (abs(n.x) > abs(n.z) ? vPatternPosition.zy : vPatternPosition.xy);
        vec2 periodic = fract(uvLocal / 16.0);
        vec2 atlasUV = vec2((atlasColumn * 256.0 + 8.0 + periodic.x * 240.0) / 1024.0,
          ((1.0 - atlasRow) * 256.0 + 8.0 + periodic.y * 240.0) / 512.0);
        vec4 textureSample = texture2D(map, atlasUV);
        diffuseColor.rgb *= mix(vec3(1.0), textureSample.rgb, uBuildingPatternStrength);
        // Graphic window rhythm is illustrative, not surveyed facade data.
        vec2 windowCell = fract(uvLocal / vec2(7.0, 9.0));
        float windowMask = step(.32, windowCell.x) * (1.0 - step(.59, windowCell.x))
          * step(.24, windowCell.y) * (1.0 - step(.81, windowCell.y))
          * (1.0 - step(.52, abs(n.y)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.028, .075, .063), windowMask * uIllustrated);
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'mauritius-building-material-atlas-v3';
  return material;
}
