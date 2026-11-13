# Mauritius — photographic visual references

The material textures in `/public/textures` are **original generated artworks**. External photographs were used only to study colors, grain, motifs and geographic character. **No third-party photographs are embedded, traced, hotlinked or distributed** as terrain/building textures.

| Reference location | Photographic reference | Applied visual cues | Limit |
|---|---|---|---|
| Le Morne Peninsula | [Heritage Resorts — aerial helicopter view](https://heritageresorts.mu/plan-stay-mauritius/skyward-wonders-mauritius-helicopter-tours) | Deep blue ocean, saturated cyan lagoons, light coral-sand shoreline, dark mountain basalt | Reef tile is an illustrative surface pattern, **not** measured reef geometry or bathymetry |
| Sugarcane fields around Mauritius | [Sugar Investment Trust — estate aerial image](https://www.sit.mu/subsidiaries/sit-land-holdings/) | Alternating rows of leafy green, geometric field structure and muted roads | Field row texture applies to raster-inferred vegetation; agricultural boundaries are not vector-accurate |
| Port Louis neighborhoods | [Port Louis aerial photo reference](https://www.gettyimages.com/photos/port-louis-mauritius-aerial) | Pale roof concrete, weathered white façades, occasional terracotta, corrugated metal, blue-gray windows | Missing OSM building materials are visually inferred by category, **not confirmed** |
| Chamarel Seven Coloured Earths | [Wikimedia Commons: Chamarel-SevenColours.jpg](https://commons.wikimedia.org/wiki/File:Chamarel-SevenColours.jpg) | Layered ochres, red/brown and violet soil bands | Site paint is **illustrative**, a small circular region around an approximate site coordinate, not a surveyed boundary |
| West-coast mountains and farms | [Photographic landscape study](https://www.routard.com/fr/mag/dossier/a/l-ile-maurice-en-photos) | Jagged basalt ridges against agricultural fields and tropical foliage | Elevation is from DEM; rock texture classification uses approximate height and slope thresholds |

## Texture mapping

`surface-atlas.png` is a **4×2 atlas** of eight original 256×256 tiles: lagoon, sand, sugarcane, forest, basalt, colored soil, asphalt and grassland. `building-atlas.png` contains eight original façade and rooftop patterns. The material selection code is in `src/map-shaders.js` and `src/materials.js`.

### Accuracy and legal treatment

- OpenStreetMap is the geographic base, not an architectural materials survey. Standard OSM raster colors are approximately classified in a fragment shader. Labels are baked into tiles.
- Elevation uses Mapzen Terrain Tiles in Terrarium format; the rendering intentionally exaggerates vertical heights by default. The terrain URL is loaded dynamically with no key. If terrain requests fail, the app retains the textured flat map.
- Photos in the table retain their original photographers' copyrights or licenses; they are linked solely for reference and **none** are redistributed.
- Recreate the original texture PNGs by running `python scripts/generate_textures.py` after installing the optional Python dependencies `Pillow` and `numpy`. You do not need Python to run the app.
