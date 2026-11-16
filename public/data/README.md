# Mauritius Life scene snapshots

© OpenStreetMap contributors. Data licensed under the Open Database License (ODbL) 1.0:
https://opendatacommons.org/licenses/odbl/1-0/
Attribution and terms: https://www.openstreetmap.org/copyright

Extracted from https://download.geofabrik.de/africa/mauritius.html
OSM replication timestamp: 2026-11-15T21:22:28Z. Each JSON records its source SHA-256.

Four town extracts contain real building footprints, road centerlines, mapped green/water areas and trees within ±0.018 degrees of their destination. Coastline contains closed, node-connected real OSM shoreline rings for the main Mauritius area. No raster tiles are cached or redistributed.

These are bounded scenes, not a complete offline island map. Flat terrain, road widths, colors, decorative park trees, windows and untagged building heights are illustrative. Building snapshots can become outdated; not for navigation or surveying.

Rebuild with `python3 scripts/build-scene-data.py /path/to/mauritius.osm.pbf` from the project root. The build-only tool requires pyosmium; the web application has no new dependency. The script reads a supplied file and never downloads or publishes data.
