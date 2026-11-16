/**
 * The map palette is intentionally separate from the rendering code.
 * Color values are sRGB hex strings; THREE.Color converts them into linear space.
 * Change these values to restyle the entire world.
 */
export const PALETTES = {
  island: {
    label: 'Island Life', illustrated: true,
    sky: '#83b6c3', fog: '#aebf9a', ocean: '#83b6c3', lagoon: '#83b6c3',
    land: '#9eac76', vegetation: '#75945b', roads: '#d8d7bb',
    accent: '#298467', sun: '#fff4dc', hemisphereSky: '#ffffff',
    hemisphereGround: '#899074', exposure: 1, sunIntensity: 2.1,
    ambientIntensity: 2.2, buildingEmissive: '#000000',
    buildings: {
      default: { roof: '#c5c1a0', wall: '#989b7d' },
      home: { roof: '#be7953', wall: '#acac8d' },
      apartments: { roof: '#c8c09b', wall: '#969c7e' },
      commercial: { roof: '#d2bc85', wall: '#999b7c' },
      industrial: { roof: '#7d967e', wall: '#a7aa8c' },
      heritage: { roof: '#c18a5b', wall: '#c3bd9a' },
    },
  },
  tropical: {
    label: 'Tropical',
    sky: '#a7dadd', fog: '#b1e1df', ocean: '#07627a',
    lagoon: '#6cded4', land: '#d9ddbd', vegetation: '#78b873', roads: '#eae0cd',
    accent: '#1b705f', sun: '#fff2cb', hemisphereSky: '#ecf7e5',
    hemisphereGround: '#9dada0', exposure: 1.15, sunIntensity: 2.9,
    ambientIntensity: 1.65, buildingEmissive: '#000000',
    buildings: {
      default:    { roof: '#efdcac', wall: '#c6b69c' },
      home:       { roof: '#eccca8', wall: '#c5ad91' },
      apartments: { roof: '#e4d5bb', wall: '#a9a69e' },
      commercial: { roof: '#d4e7dd', wall: '#8da9a7' },
      industrial: { roof: '#a9c5c8', wall: '#718c96' },
      heritage:   { roof: '#e9b88f', wall: '#a67d69' },
    },
  },
  sunset: {
    label: 'Sunset',
    sky: '#dc8a81', fog: '#e7ab97', ocean: '#305c7b', lagoon: '#83c9bc',
    land: '#e2b39a', vegetation: '#929c70', roads: '#ffe2b6',
    accent: '#a04745', sun: '#ffcb84', hemisphereSky: '#ffe2b4',
    hemisphereGround: '#715b66', exposure: 1.05, sunIntensity: 2.3,
    ambientIntensity: 1.15, buildingEmissive: '#281209',
    buildings: {
      default:    { roof: '#f6c28e', wall: '#a77274' },
      home:       { roof: '#f4b58e', wall: '#aa7673' },
      apartments: { roof: '#e8b6a9', wall: '#967c8c' },
      commercial: { roof: '#f8c88d', wall: '#a26773' },
      industrial: { roof: '#b1b7aa', wall: '#717d83' },
      heritage:   { roof: '#ffd1a1', wall: '#a9665c' },
    },
  },
  midnight: {
    label: 'Midnight',
    sky: '#07192c', fog: '#10283c', ocean: '#072d43', lagoon: '#15556d',
    land: '#21354b', vegetation: '#1d4d4a', roads: '#648fa4',
    accent: '#49d9c6', sun: '#9bbdff', hemisphereSky: '#729dcc',
    hemisphereGround: '#101f35', exposure: 1.0, sunIntensity: 1.25,
    ambientIntensity: 1.75, buildingEmissive: '#071b29',
    buildings: {
      default:    { roof: '#c3d4d5', wall: '#748a99' },
      home:       { roof: '#b8cfd3', wall: '#637e91' },
      apartments: { roof: '#9ecdd4', wall: '#527f8e' },
      commercial: { roof: '#65d2c1', wall: '#397f83' },
      industrial: { roof: '#9cbbc9', wall: '#49677d' },
      heritage:   { roof: '#cbbbac', wall: '#877f83' },
    },
  },
  osm: {
    label: 'OSM colours',
    originalTiles: true,
    sky: '#b9d3e4', fog: '#cddde2', ocean: '#aad3df', lagoon: '#aad3df',
    land: '#f2efe9', vegetation: '#b5d7ab', roads: '#ffffff',
    accent: '#326d90', sun: '#fff5e8', hemisphereSky: '#fff6ec',
    hemisphereGround: '#8796a0', exposure: 1.05, sunIntensity: 2.2,
    ambientIntensity: 1.45, buildingEmissive: '#000000',
    buildings: {
      default:    { roof: '#e0d8ca', wall: '#b2a999' },
      home:       { roof: '#dbd2c6', wall: '#b1a398' },
      apartments: { roof: '#cdd3d9', wall: '#99a9b3' },
      commercial: { roof: '#bcd4dd', wall: '#8cabb5' },
      industrial: { roof: '#afc0c8', wall: '#879aa2' },
      heritage:   { roof: '#d9b69a', wall: '#ad8d78' },
    },
  },
};

export function classifyBuilding(tags = {}) {
  const type = String(tags.building || '').toLowerCase();
  const use = String(tags['building:use'] || '').toLowerCase();
  if (['industrial', 'warehouse', 'factory', 'hangar'].includes(type) || use === 'industrial') return 'industrial';
  if (['commercial', 'office', 'retail', 'supermarket', 'hotel', 'hospital'].includes(type) ||
      ['commercial', 'retail'].includes(use) || tags.shop || tags.office) return 'commercial';
  if (['apartments', 'residential', 'dormitory'].includes(type)) return 'apartments';
  if (['church', 'cathedral', 'chapel', 'temple', 'mosque', 'synagogue', 'monastery'].includes(type)) return 'heritage';
  if (['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'hut'].includes(type)) return 'home';
  return 'default';
}

export function parseHeight(tags = {}) {
  const raw = String(tags.height ?? '').trim().toLowerCase();
  const match = raw.match(/^([\d.]+)\s*(m|metres?|meters?|ft|feet)?$/);
  if (match) {
    const number = Number.parseFloat(match[1]);
    if (Number.isFinite(number) && number > 0) {
      return Math.min(180, Math.max(2.5, number * (match[2] === 'ft' || match[2] === 'feet' ? 0.3048 : 1)));
    }
  }
  const levels = Number.parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) return Math.min(140, Math.max(3, levels * 3.2));
  const estimated = {
    apartments: 13, commercial: 10, industrial: 8,
    heritage: 12, home: 5.5, default: 5.5,
  };
  return estimated[classifyBuilding(tags)];
}

/** Stable 0–1 variation avoids random color flicker between reloads. */
export function idVariation(id = 0) {
  const n = Number(id) || 0;
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}
