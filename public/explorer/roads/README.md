# Named road index

Source: https://overpass-api.de/api/interpreter

OSM tag timestamp: 2026-11-23T07:38:51Z

Read-only Overpass POST query (`data` form field):

```text
[out:json][timeout:45];way["highway"]["name"](-20.56,57.18,-19.94,57.85);out tags;
```

Tag JSON SHA-256: `2171810bb84630e73c94c3860ceb46c8d7c38c65499d4b0d5d329e2ece34cfca`

Geometry index SHA-256: `c6a068299cb399f60ae8f15b90856dadbefc8d43fd7b07aa01ea61413bd02f99`

Geometry original extract SHA-256: `3d7e03a3248069c8bad3fa1679e37afcc58a2ae88c336aeb1ca436e9a92d93c7`

Geometry tile manifest SHA-256: `6b881f4e9c20547c1f29ff6fd03aa411cac24a39ae73db0aaba8bdf6d9294c69`

Places JSON SHA-256: `4442872d08c46401d74bb9f34588437446d9f2a48739303a09e3b6011c5d1969`

Coverage: 42553 mapped ways; 9334 matched named ways; 0 matched unnamed ways omitted; 33219 ways absent from metadata omitted; 6504 road records.

Unmatched means no metadata ID join, not a claim that the road is unnamed. A name-filtered tag extract cannot distinguish genuinely unnamed roads from metadata/geometry snapshot drift.

Geometry is copied from existing clipped tile paths, deduplicating only exact or reversed duplicates. No points are joined or resampled. Connected components share exact stored vertices, normalized names, nearest-place labels and layer/bridge/tunnel tags. Original node IDs are unavailable, so coincident coordinates are not proof of network connectivity. Missing grade tags mean surface layer 0. Tag and geometry snapshots may differ.

Locality is approximate: Near the nearest actual city/town/village in places.json at the way's longest-path midpoint, not an official address or administrative boundary. Component anchors are halfway along the longest original clip path using latitude-aware approximate lengths. Bounds cover all paths. Roads use minimum constituent way ID; bucket = ID modulo 32.

The tile manifest digest hashes sorted UTF-8 lines of filename, NUL, file SHA-256, newline. Source URL, source timestamp, and exact metadata/geometry/place hashes live in index.json. Rerun scripts/build-road-index.py --help for reproducible CLI options.

License: ODbL-1.0. © OpenStreetMap contributors; https://www.openstreetmap.org/copyright
