/** Stylized textures inspired by Mauritius aerial and architectural photography.
 * Base OSM tile classification is an approximation from pixels: not vector
 * land-use labels and not a geolocated reef/bathymetric survey.
 */
export const mapVertexShader = /* glsl */ `
  attribute float elevation;
  varying vec2 vUv;
  varying vec2 vSurfaceWorld;
  varying float vAltitude;
  varying float vSlope;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vSurfaceWorld = position.xz;
    vAltitude = elevation;
    vSlope = 1.0 - clamp(normal.y, 0.0, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const mapFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uSurfaceAtlas;
  uniform vec3 uLand;
  uniform vec3 uWater;
  uniform vec3 uDeepWater;
  uniform vec3 uPark;
  uniform vec3 uRoad;
  uniform float uOriginal;
  uniform float uIllustrated;
  uniform float uTextureStrength;
  uniform vec2 uChamarel;
  varying vec2 vUv;
  varying vec2 vSurfaceWorld;
  varying float vAltitude;
  varying float vSlope;
  #include <common>
  #include <fog_pars_fragment>

  vec3 atlas(float index, vec2 coord, float period) {
    vec2 cell = floor(vec2(mod(index, 4.0), index / 4.0));
    // Each 256x256 atlas cell has a 8px protected margin.
    vec2 local = fract(coord / period);
    vec2 pixel = vec2(cell.x * 256.0 + 8.0 + local.x * 240.0,
      (1.0 - cell.y) * 256.0 + 8.0 + local.y * 240.0);
    return texture2D(uSurfaceAtlas, pixel / vec2(1024.0, 512.0)).rgb;
  }

  float waterAt(vec2 uv) {
    vec3 src = texture2D(uMap, uv).rgb;
    return smoothstep(0.075, 0.22, src.b - src.r)
         * smoothstep(0.012, 0.13, src.g - src.r);
  }

  void main() {
    vec4 source = texture2D(uMap, vUv);
    vec3 src = source.rgb;
    float bright = dot(src, vec3(0.2126, 0.7152, 0.0722));
    float water = waterAt(vUv);
    float vegetation = smoothstep(0.035, 0.18, src.g - src.r)
       * smoothstep(-0.02, 0.09, src.g - src.b) * (1.0 - water);
    float road = smoothstep(0.76, 0.94, bright) * (1.0 - water) * (1.0 - vegetation);

    float nearWater = max(max(waterAt(vUv + vec2(.011, 0.0)), waterAt(vUv - vec2(.011, 0.0))),
                      max(waterAt(vUv + vec2(0.0, .011)), waterAt(vUv - vec2(0.0, .011))));
    float beach = (1.0 - water) * (1.0 - vegetation) * nearWater
                * (1.0 - smoothstep(8.0, 38.0, vAltitude));
    float rock = smoothstep(0.17, 0.45, vSlope) * smoothstep(75.0, 220.0, vAltitude);
    float forest = vegetation * smoothstep(70.0, 250.0, vAltitude);
    float farmland = vegetation * (1.0 - forest);
    // Approximate *illustrative* treatment around the attraction, NOT its
    // real mapped boundary. The color study comes from Chamarel photographs.
    float colouredEarth = (1.0 - water) * (1.0 - road) *
      (1.0 - smoothstep(70.0, 230.0, distance(vSurfaceWorld, uChamarel)));

    vec3 base = mix(uLand, uPark, vegetation);
    base = mix(base, uRoad, road * .93);
    base = mix(base, vec3(0.91,0.83,0.64), beach * .80);
    base = mix(base, vec3(0.32,0.39,0.36), rock * .87);
    base = mix(base, uWater, water);
    base = mix(base, vec3(.67,.34,.24), colouredEarth * .85);

    // Colorize with actual bitmap materials. Multiple layers keep coast,
    // crop rows, forest, basalt and road surfaces visibly distinct.
    vec3 landGrain = atlas(7.0, vSurfaceWorld, 36.0);
    vec3 sand = atlas(1.0, vSurfaceWorld, 30.0);
    vec3 cane = atlas(2.0, vSurfaceWorld, 130.0);
    vec3 canopy = atlas(3.0, vSurfaceWorld, 150.0);
    vec3 basalt = atlas(4.0, vSurfaceWorld, 80.0);
    vec3 tarmac = atlas(6.0, vSurfaceWorld, 15.0);
    vec3 lagoon = atlas(0.0, vSurfaceWorld, 240.0);
    vec3 surfacePattern = landGrain;
    surfacePattern = mix(surfacePattern, sand, beach);
    surfacePattern = mix(surfacePattern, cane, farmland);
    surfacePattern = mix(surfacePattern, canopy, forest);
    surfacePattern = mix(surfacePattern, basalt, rock);
    surfacePattern = mix(surfacePattern, tarmac, road);
    surfacePattern = mix(surfacePattern, lagoon, water);
    surfacePattern = mix(surfacePattern, atlas(5.0, vSurfaceWorld, 86.0), colouredEarth);

    vec3 color = mix(base, surfacePattern, clamp(uTextureStrength,0.0,1.0) * .44);
    float ink = clamp((0.70 - bright) * .27, -.04, .15);
    color *= 1.0 - ink * (1.0 - water);
    float hillShade = mix(1.0, .79, rock) * (1.0 - vSlope * .18);
    color *= hillShade;
    // Flatten raster labels and grain in the illustration palette; keep real
    // coastlines/roads and preserve the original map mode below.
    vec3 illustrated = mix(uLand, uPark, vegetation);
    illustrated = mix(illustrated, uRoad, road * .85);
    illustrated = mix(illustrated, vec3(.58, .58, .35), beach * .45);
    illustrated *= 1.0 - vSlope * .16;
    illustrated = mix(illustrated, uWater, water);
    color = mix(color, illustrated, uIllustrated * (1.0 - uTextureStrength));
    vec3 finalColor = mix(color, src, uOriginal);
    gl_FragColor = vec4(finalColor, source.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export const seaVertexShader = /* glsl */ `
  varying vec2 vOcean;
  #include <fog_pars_vertex>
  void main() {
    vOcean = position.xy;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const seaFragmentShader = /* glsl */ `
  uniform vec3 uWater;
  uniform float uTime;
  uniform float uIllustrated;
  varying vec2 vOcean;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float a = sin(vOcean.x*.0022 + uTime*.23);
    float b = sin(vOcean.y*.0033 - uTime*.18);
    float w = sin(vOcean.x*.0091 + vOcean.y*.0026 + uTime*.6);
    float shimmer = (a*b)*.04 + pow(abs(w),16.0)*.02;
    gl_FragColor = vec4(uWater * mix(.94 + shimmer, 1.0, uIllustrated), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
