export const DESTINATIONS = {
  mauritius: { name: 'Mauritius', region: 'THE INDIAN OCEAN', description: 'One island. A thousand little discoveries. Find your own corner of Mauritius.', lat: -20.22, lon: 57.52, zoom: 11 },
  portLouis: { name: 'Port Louis', region: 'THE CAPITAL', description: 'Harbour streets, colourful rooftops, and a city between the mountains and the sea.', lat: -20.1609, lon: 57.5012, zoom: 15 },
  grandBaie: { name: 'Grand Baie', region: 'THE NORTH COAST', description: 'A sheltered bay, sunlit streets, and the slow rhythm of the north coast.', lat: -20.0132, lon: 57.5803, zoom: 15 },
  flicEnFlac: { name: 'Flic en Flac', lat: -20.2745, lon: 57.3631, zoom: 15 },
  leMorne: { name: 'Le Morne', lat: -20.4516, lon: 57.3221, zoom: 15 },
  chamarel: { name: 'Chamarel village', lat: -20.4268, lon: 57.3917, zoom: 15 },
  colouredEarth: { name: 'Chamarel · Seven Coloured Earths', lat: -20.44065, lon: 57.3739, zoom: 15 },
  curepipe: { name: 'Curepipe', lat: -20.3154, lon: 57.5203, zoom: 15 },
  mahebourg: { name: 'Mahébourg', region: 'THE SOUTHEAST', description: 'Old coastal lanes, fishing boats, and a lagoon that stretches to the horizon.', lat: -20.4081, lon: 57.7000, zoom: 15 },
  tamarin: { name: 'Tamarin', region: 'THE WEST COAST', description: 'Salt pans, mountain silhouettes, and warm evenings on the quieter coast.', lat: -20.3256, lon: 57.3706, zoom: 15 },
  rodrigues: { name: 'Rodrigues', lat: -19.7245, lon: 63.4272, zoom: 12 },
  agalega: { name: 'Agaléga', lat: -10.420, lon: 56.610, zoom: 12 },
  saintBrandon: { name: 'Saint Brandon', lat: -16.580, lon: 59.620, zoom: 12 },
};

export const FEATURED = ['portLouis', 'grandBaie', 'mahebourg', 'tamarin'];
export const DEFAULT_DESTINATION = 'portLouis';
export const DEFAULT_PALETTE = 'island';

const paths = {
  island: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  home: '<path d="m4 10 8-7 8 7v10H4zM9 20v-7h6v7"/>',
  rotate: '<path d="M5 8a8 8 0 1 1-1 7M5 3v5h5"/>',
  tilt: '<path d="m6 7 15 0-5 11H1z"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  portLouis: '<path d="M2 21V9h6v12M8 21V3h8v18M16 21V12h6v9M11 6h2m-2 4h2m-2 4h2M4 12h2m-2 4h2m12 0h2M1 21h22"/>',
  grandBaie: '<path d="M12 2v17M10 4 3 16h7M14 6l6 10h-6M2 20h20l-3 3H5z"/>',
  mahebourg: '<circle cx="12" cy="4" r="2"/><path d="M12 6v16M7 10h10M3 14c0 10 18 10 18 0M1 16l2-2 3 2m12 0 3-2 2 2"/>',
  tamarin: '<path d="M12 8c0 6 2 10 4 15M12 8C7 1 3 5 2 9c5-2 7-2 10-1Zm0 0c5-7 9-2 10 1-5-2-7-2-10-1Zm0 0c-7-2-8 4-7 7 2-4 4-5 7-7Zm0 0c4-3 7 1 7 5-2-3-4-4-7-5Z"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.island}</svg>`;
}

export function renderExperience(palettes) {
  return `
    <header class="masthead">
      <a class="brand" href="#" id="brandHome" aria-label="Mauritius Life — whole island"><span class="brandMark">m<span>•</span></span><span><span class="brandName"><b>MAURITIUS</b> LIFE</span><span class="brandTagline">A LITTLE WORLD TO EXPLORE</span></span></a>
      <div class="exploring"><i></i><span id="locationChip">Exploring Port Louis</span></div>
      <button id="wholeIsland" class="islandButton" aria-label="Whole island">${icon('island')}<span>Whole island</span></button>
      <button id="helpToggle" class="helpButton" aria-label="How to explore" aria-controls="helpPanel" aria-expanded="false">?</button>
    </header>
    <section class="placeIntro" aria-label="Current location"><p class="eyebrow" id="placeRegion">THE CAPITAL</p><h1><span id="placeName">Port Louis</span><span class="titleAccent">.</span></h1><p id="placeDescription">Harbour streets, colourful rooftops, and a city between the mountains and the sea.</p><div class="country"><i class="flag" aria-hidden="true"></i>MAURITIUS · INDIAN OCEAN</div></section>
    <nav class="mapTools" aria-label="Camera controls">
      <button id="zoomIn" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button><button id="zoomOut" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button><span class="toolDivider"></span>
      <button id="reset" aria-label="Reset camera" title="Reset camera">${icon('home')}</button><button id="rotate" aria-label="Rotate view" title="Rotate view">${icon('rotate')}</button><button id="tilt" aria-label="Toggle overhead view" title="Toggle overhead view" aria-pressed="false">${icon('tilt')}</button>
    </nav>
    <button id="layersToggle" class="layersToggle" aria-expanded="false" aria-controls="layersPanel">${icon('layers')} Layers</button>
    <aside id="layersPanel" class="hud" aria-label="Map layers and settings" hidden>
      <div class="panelHeading"><h2>Make it your island.</h2><button id="layersClose" class="iconButton" aria-label="Close layers">${icon('close')}</button></div>
      <label for="destination">EXPLORE A LOCATION</label><select id="destination">${Object.entries(DESTINATIONS).map(([key, place]) => `<option value="${key}" ${key === DEFAULT_DESTINATION ? 'selected' : ''}>${place.name}</option>`).join('')}</select>
      <div class="buttonRow"><button id="go" class="primary">Explore area ↗</button><button id="center">Focus here</button></div>
      <div class="sectionTitle">COLOUR YOUR WORLD</div><div class="paletteGrid" role="group" aria-label="Color palette">${Object.entries(palettes).map(([key, value]) => `<button class="paletteButton ${key === DEFAULT_PALETTE ? 'selected' : ''}" data-palette="${key}" aria-pressed="${key === DEFAULT_PALETTE}"><span class="palettePreview" style="--p1:${value.ocean};--p2:${value.vegetation};--p3:${value.land}"></span>${value.label}</button>`).join('')}</div>
      <div class="sectionTitle">THE LITTLE DETAILS</div>
      <div class="controlLine"><label for="relief">Mountain relief</label><output id="reliefText">1.0×</output></div><input type="range" min="0" max="3" step="0.1" value="1" id="relief" />
      <div class="controlLine"><label for="surfaceDetail">Surface texture</label><output id="surfaceText">0%</output></div><input type="range" min="0" max="100" step="1" value="0" id="surfaceDetail" />
      <div class="controlLine"><label for="height">Building height</label><output id="heightText">2.5×</output></div><input type="range" min="1" max="5" step="0.5" value="2.5" id="height" />
      <div class="checkRow"><label><input id="buildings" type="checkbox" checked /> Buildings</label><label><input id="shadows" type="checkbox" checked /> Shadows</label><label><input id="markers" type="checkbox" checked /> Places</label></div>
      <div class="legend"><span><i id="legendWater"></i>Lagoon</span><span><i id="legendPark"></i>Green spaces</span><span><i id="legendRoad"></i>Roads</span></div>
      <button id="snapshot" class="snapshot">Save a postcard ↗ <small>PNG · map only</small></button>
      <p class="accuracy">Real map footprints and elevation where available. Building heights, colours and windows are illustrative. <a href="${import.meta.env?.BASE_URL || '/'}textures/material-reference-sheet.png" target="_blank" rel="noopener">Texture study ↗</a></p>
    </aside>
    <aside id="helpPanel" class="helpPanel" aria-label="How to explore" hidden><h2>A little room to wander.</h2><p>Drag to orbit · Right-drag to pan · Scroll to zoom.</p><p>On touch screens: one finger to orbit, two to pan or pinch. Double-click the map to explore somewhere new.</p><p>Choose a named building pin for its map label. Layers holds all locations and appearance settings. Press Escape to close panels.</p></aside>
    <div id="markersLayer" class="markersLayer" aria-label="Places on the map"></div>
    <div id="placePopover" class="placePopover" role="status" hidden></div>
    <footer class="destinationDock"><div class="dockHeading"><span>CHOOSE YOUR CORNER OF THE ISLAND</span><span class="gestureHint">DRAG TO ROTATE · RIGHT-DRAG TO PAN · SCROLL TO ZOOM</span></div><nav class="destinationCards" aria-label="Featured destinations">${FEATURED.map(key => `<button data-destination="${key}" class="destinationCard ${key === DEFAULT_DESTINATION ? 'selected' : ''}" aria-pressed="${key === DEFAULT_DESTINATION}"><span class="destinationIcon ${key}">${icon(key)}</span><span><b>${DESTINATIONS[key].name}</b><small>${DESTINATIONS[key].region}</small></span></button>`).join('')}</nav></footer>
    <div id="status" class="status" role="status">Finding your corner of the island…</div>
    <div class="attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Mapzen terrain</a></div>`;
}

export function setCameraFrame(camera, height, aspect) {
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}
