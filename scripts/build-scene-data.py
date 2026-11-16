"""Build small, same-origin ODbL scenes from a Geofabrik Mauritius .osm.pbf.
Build tool only: requires pyosmium, not an application/runtime dependency.
Usage: python3 scripts/build-scene-data.py /path/to/mauritius.osm.pbf
No raster tile download, invented footprints, or automatic network calls.
"""
import sys, json, pathlib, hashlib
import osmium

TOWNS = {"portLouis": (-20.1609, 57.5012), "grandBaie": (-20.0132, 57.5803),
         "mahebourg": (-20.4081, 57.7000), "tamarin": (-20.3256, 57.3706)}
SPAN = .018
KEEP = {"building", "building:levels", "height", "name", "highway", "natural", "water",
        "landuse", "leisure", "waterway", "roof:material", "building:material"}
source = pathlib.Path(sys.argv[1])
reader = osmium.io.Reader(str(source))
stamp = reader.header().get("osmosis_replication_timestamp")
reader.close()
meta = {"source": "https://download.geofabrik.de/africa/mauritius.html", "timestamp": stamp,
        "license": "https://opendatacommons.org/licenses/odbl/1-0/", "attribution": "© OpenStreetMap contributors",
        "sourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest()}
scenes = {key: {**meta, "bounds": [lat-SPAN, lon-SPAN, lat+SPAN, lon+SPAN], "elements": []}
          for key, (lat, lon) in TOWNS.items()}
coasts = []

def point(lat, lon):
    return {"lat": round(lat, 7), "lon": round(lon, 7)}

def inside(lat, lon, origin):
    return abs(lat-origin[0]) <= SPAN and abs(lon-origin[1]) <= SPAN

class Extract(osmium.SimpleHandler):
    def node(self, n):
        if n.tags.get("natural") != "tree": return
        for key, origin in TOWNS.items():
            if inside(n.location.lat, n.location.lon, origin):
                scenes[key]["elements"].append({"type": "node", "id": n.id, **point(n.location.lat, n.location.lon), "tags": {"natural": "tree"}})
    def way(self, w):
        tags = {tag.k: tag.v for tag in w.tags if tag.k in KEEP}
        if not tags or not any(k in tags for k in ["building", "highway", "natural", "water", "landuse", "leisure", "waterway"]): return
        try: pts = [point(n.lat, n.lon) for n in w.nodes]
        except osmium.InvalidLocationError: return
        if len(pts) < 2: return
        if tags.get("natural") == "coastline":
            if any(-20.7 < p["lat"] < -19.8 and 57.1 < p["lon"] < 57.9 for p in pts):
                coasts.append(([n.ref for n in w.nodes], pts))
            return
        for key, origin in TOWNS.items():
            if any(inside(p["lat"], p["lon"], origin) for p in pts):
                scenes[key]["elements"].append({"type": "way", "id": w.id, "tags": tags, "geometry": pts})

Extract().apply_file(str(source), locations=True)
# OSM coastlines are directed with land on the left. Join shared node IDs,
# never bridge a missing segment or manufacture a shoreline.
remaining = {ids[0]: (ids, pts) for ids, pts in coasts}
assert len(remaining) == len(coasts), "Ambiguous coastline start"
rings = []
while remaining:
    start, (ids, pts) = remaining.popitem()
    end = ids[-1]
    while end != start:
        assert end in remaining, f"Open coastline at node {end}"
        more_ids, more_pts = remaining.pop(end)
        pts.extend(more_pts[1:]); end = more_ids[-1]
    if len(pts) >= 4: rings.append(pts)
assert rings and max(map(len, rings)) > 100, "Missing main island coastline"
out = pathlib.Path("public/data")
out.mkdir(exist_ok=True)
for key, scene in {**scenes, "coastline": {**meta, "rings": rings}}.items():
    (out / f"{key}.json").write_text(json.dumps(scene, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(key, len(scene.get("elements", [])), "elements", len(scene.get("rings", [])), "rings", (out / f"{key}.json").stat().st_size, "bytes")
print("OSM timestamp:", stamp)
