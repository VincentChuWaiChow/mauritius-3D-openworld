# Mauritius reef and lagoon snapshot

Actual OpenStreetMap polygon geometry, not an invented coastline buffer:
**39 features: 29 reefs and 10 lagoons**, including three multipolygon relations
and **five preserved inner rings**. Coverage is partial, volunteered and uneven;
absence here does not mean absence of a reef or lagoon in the real world.

## Provenance and reuse

- Source: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  retrieved through <https://overpass-api.de/api/interpreter>.
- Source database timestamp: **2026-11-25T15:18:06Z**. This is a dated mapping
  snapshot, not live coral-health data, a biodiversity survey, or current water
  conditions. It is **not suitable for navigation**, diving safety or surf forecasts.
- License: [Open Database License 1.0 (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
  Attribute **© OpenStreetMap contributors** when displaying or redistributing
  these data, retain the license/source notice, and observe ODbL requirements for
  any publicly used derivative database.
- `source-overpass.json` is the unmodified 139,371-byte response. SHA-256:
  `a34148e478c7a07e6f581a8026da4b630e517685fbcffd9d3ccb324e71459193`.
- `index.json` is deterministic marine API v1. Coordinates remain original
  `[longitude, latitude]` values without simplification, resampling or rounding.
  Each feature links to its original OSM way or relation. No features were rejected
  or skipped from this 39-feature source snapshot.

Query, in Overpass QL (the bounding box is south, west, north, east):

```text
[out:json][timeout:45];(nwr[natural=reef](-20.6,57.2,-19.9,57.9);nwr[water=lagoon](-20.6,57.2,-19.9,57.9);nwr[natural=bay][name~"lagoon|lagon",i](-20.6,57.2,-19.9,57.9););out body geom;
```

## Labels and known limitations

The four named source features retain their OSM names: **Blue Bay Riff**, **Reef**,
**Citron** and **Paquet Bay**. Other names are explicitly generated labels:
`Reef near <settlement>`, `Coral reef near <settlement>` (only with a source
`reef=coral` tag), or `Lagoon near <settlement>`. These are approximate
search aids, **not official names** or assertions that a boundary belongs to a town.
The nearest named city, town, village, hamlet or quarter in the existing
`public/explorer/places.json` is selected using great-circle distance from an
interior representative point. Places input SHA-256:
`4442872d08c46401d74bb9f34588437446d9f2a48739303a09e3b6011c5d1969`.
Changing that input can change generated labels; it never changes marine geometry.
Generated labels may repeat. Search results show coordinates and the OSM ID;
searching that ID (for example `w835050148`) reaches that exact mapped feature.

OSM `natural=reef` does not by itself establish living coral or its condition.
**11** source reefs have `reef=coral`, retained as `reefType:"coral"`; the other
**18** have `reefType:null` and are presented as mapped reefs, not coral-confirmed
sites. This records volunteer tags, not a biological validation. One mapped reef, way **588861939**,
also carries OSM `fixme=location/geometry/protect_class`; its geometry is retained
as mapped, not endorsed as surveyed or corrected. Visual wave animation is
illustrative and is not derived from this snapshot or ocean observations.

For independent government context see the Mauritius Ocean Data Explorer
[corals](https://ode.govmu.org/corals) and
[marine protected areas](https://ode.govmu.org/mpas---mauritius) pages. They are
contextual references only: **no government map imagery, boundaries or artwork
have been copied**, and no redistribution license for those maps is assumed.

## Offline rebuild and checks

Python 3 standard library only, from the repository root; no automatic downloads:

```sh
rtk python3 scripts/build-marine-data.py public/explorer/marine/source-overpass.json public/explorer/marine/index.json --places public/explorer/places.json
rtk proxy node --test tests/explorer-marine-data.test.js
```

The importer preserves closed way/member rings and their holes. Unordered or
reversed relation fragments join only at unique matching endpoints. Open rings,
missing member geometry, ambiguous joins, self-intersections, intersecting/nested
outers or holes, uncontained holes, and out-of-region coordinates fail the build
with feature-specific diagnostics **before writing output**. It never invents a
closure or silently drops a hole. Existing output remains unchanged on failure.
Representative centres use interior scanline midpoints, not a vertex mean that
could fall on land or inside a hole. Multiple disjoint outer polygons are supported.

Tests independently check source hashes, byte-identical repeat builds, the full
feature/ring inventory, exact original coordinates, valid centres, labels,
reversed fragments, multiple outers and fail-closed malformed geometry.
