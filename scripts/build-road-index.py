"""Join public OSM way tags to existing clipped street geometry; Python stdlib only.

No network access, source geometry edits, inferred names, or connecting segments.
See the generated README for the exact input hashes and grouping limitations.
"""
import argparse
from collections import defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata


BUCKETS = 32
ATTRIBUTION = "© OpenStreetMap contributors; https://www.openstreetmap.org/copyright"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalized(value):
    value = unicodedata.normalize("NFKD", value).casefold()
    return " ".join("".join(c if c.isalnum() else " " for c in value
                            if not unicodedata.combining(c)).split())


def way_id(value):
    # Numeric strings are accepted, but booleans/floats must not alias OSM IDs.
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError(f"Invalid numeric OSM way ID: {value!r}")
    if isinstance(value, str) and not re.fullmatch(r"[0-9]+", value):
        raise ValueError(f"Invalid numeric OSM way ID: {value!r}")
    ident = int(value)
    if ident <= 0:
        raise ValueError(f"Invalid numeric OSM way ID: {value!r}")
    return ident


def valid_point(point):
    return (isinstance(point, (list, tuple)) and len(point) == 2
            and all(isinstance(c, (float, int)) and not isinstance(c, bool)
                    and math.isfinite(c) for c in point)
            and -180 <= point[0] <= 180 and -90 <= point[1] <= 90)


def path_key(path):
    points = tuple(tuple(p) for p in path)
    return min(points, points[::-1])


def segment_length(a, b):
    # Equirectangular distance in metres: suitable for these short clip fragments.
    x = (b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot(x, b[1] - a[1]) * 111_195.08


def anchor(paths):
    """Halfway along the longest original clip path, never a bbox midpoint."""
    lengths = [sum(segment_length(a, b) for a, b in zip(p, p[1:])) for p in paths]
    selected = max(range(len(paths)), key=lambda i: lengths[i])
    path, target = paths[selected], lengths[selected] / 2
    traversed = 0.0
    for a, b in zip(path, path[1:]):
        length = segment_length(a, b)
        if length and traversed + length >= target:
            t = (target - traversed) / length
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        traversed += length
    return list(path[0])


def grade(tags):
    layer = str(tags.get("layer", "0")).strip()
    try:
        number = Decimal(layer)
        layer = str(number.normalize()) if number.is_finite() else layer
    except InvalidOperation:
        pass

    def structure(key):
        value = str(tags.get(key, "")).strip().casefold()
        return "" if value in ("", "no", "false", "0") else value

    return layer, structure("bridge"), structure("tunnel")


def read_json(path):
    raw = path.read_bytes()
    return json.loads(raw), digest(raw)


def unique_paths(paths):
    # Choose a representation actually present in the source (do not reverse it).
    result = {}
    for path in paths:
        key, points = path_key(path), tuple(tuple(p) for p in path)
        if key not in result or points < result[key]:
            result[key] = points
    return [result[key] for key in sorted(result)]


def aliases(tags_by_id, ids, name):
    values = set()
    for ident in ids:
        for key, value in tags_by_id[ident].items():
            if (key == "name" or key.startswith("name:")
                    or key in ("alt_name", "official_name", "short_name", "loc_name", "old_name", "ref")):
                if isinstance(value, str):
                    values.update(v.strip() for v in value.split(";") if v.strip() and v.strip() != name)
    return "; ".join(sorted(values, key=lambda value: (normalized(value), value)))


def build(metadata_path, tiles, places_path, out, source_url, source_timestamp=None, source_query=None):
    metadata, metadata_hash = read_json(metadata_path)
    if not isinstance(metadata, dict) or not isinstance(metadata.get("elements"), list):
        raise ValueError("Metadata must contain an Overpass-style elements array")
    if metadata.get("remark"):
        raise ValueError(f"Overpass reported an incomplete/error response: {metadata['remark']}")
    timestamp = (source_timestamp or metadata.get("osm3s", {}).get("timestamp_osm_base")
                 or metadata.get("source", {}).get("timestamp") or metadata.get("timestamp"))
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise ValueError("Source timestamp missing: supply --source-timestamp or osm3s.timestamp_osm_base")
    if not source_url.strip():
        raise ValueError("Source URL is required")
    tags_by_id = {}
    for element in metadata["elements"]:
        if not isinstance(element, dict) or element.get("type") != "way":
            continue
        ident, tags = way_id(element.get("id")), element.get("tags", {})
        if not isinstance(tags, dict):
            raise ValueError(f"Invalid tags for way {ident}")
        if ident in tags_by_id and tags_by_id[ident] != tags:
            raise ValueError(f"Conflicting metadata for way {ident}")
        tags_by_id[ident] = tags

    tile_index, index_hash = read_json(tiles / "index.json")
    keys = tile_index.get("keys")
    if not isinstance(keys, list) or not keys or any(not isinstance(k, str) or not re.fullmatch(r"-?\d+_-?\d+", k) for k in keys):
        raise ValueError("Geometry index must contain valid existing tile keys")
    by_way, tile_hasher = defaultdict(list), hashlib.sha256()
    for key in sorted(set(keys)):
        tile, tile_hash = read_json(tiles / f"{key}.json")
        tile_hasher.update(f"{key}.json\0{tile_hash}\n".encode("utf8"))
        for road in tile.get("roads", []):
            ident, path = way_id(road.get("id")), road.get("points")
            if not isinstance(path, list) or len(path) < 2 or not all(valid_point(p) for p in path):
                raise ValueError(f"Invalid existing geometry for way {ident} in {key}")
            if not any(a != b for a, b in zip(path, path[1:])):
                raise ValueError(f"Degenerate existing geometry for way {ident} in {key}")
            by_way[ident].append(path)
    by_way = {ident: unique_paths(paths) for ident, paths in by_way.items()}

    place_data, places_hash = read_json(places_path)
    places = sorted((p for p in place_data.get("places", [])
                     if p.get("kind") in ("city", "town", "village")
                     and isinstance(p.get("name"), str) and p["name"].strip()
                     and valid_point(p.get("center"))),
                    key=lambda p: (str(p.get("id", "")), p["name"], p["center"]))
    if not places:
        raise ValueError("No actual named city/town/village available for approximate locality")

    groups, localities = defaultdict(list), {}
    for ident in sorted(by_way):
        tags = tags_by_id.get(ident, {})
        name = tags.get("name", "")
        if not isinstance(name, str) or not name.strip() or not normalized(name):
            continue
        center = anchor(by_way[ident])
        place = min(places, key=lambda p: segment_length(center, p["center"]))
        localities[ident] = "Near " + place["name"].strip()
        groups[(normalized(name), localities[ident], grade(tags))].append(ident)

    components = []
    for ids in groups.values():
        parents = {ident: ident for ident in ids}

        def root(ident):
            while parents[ident] != ident:
                parents[ident] = parents[parents[ident]]
                ident = parents[ident]
            return ident

        vertices = {}
        for ident in ids:
            for path in by_way[ident]:
                for point in path:
                    if point in vertices:
                        a, b = root(ident), root(vertices[point])
                        parents[max(a, b)] = min(a, b)
                    else:
                        vertices[point] = ident
        members = defaultdict(list)
        for ident in ids:
            members[root(ident)].append(ident)
        components.extend(members.values())

    buckets = [{"version": 1, "roads": {}} for _ in range(BUCKETS)]
    roads = []
    for ids in sorted(components, key=min):
        ids.sort()
        ident, paths = ids[0], unique_paths(p for way in ids for p in by_way[way])
        name = tags_by_id[ident]["name"].strip()
        bucket = ident % BUCKETS
        points = [point for path in paths for point in path]
        record = {"id": f"r{ident}", "name": name, "aliases": aliases(tags_by_id, ids, name),
                  "kind": "road", "locality": localities[ident], "center": anchor(paths),
                  "bounds": [min(p[0] for p in points), min(p[1] for p in points),
                             max(p[0] for p in points), max(p[1] for p in points)],
                  "wayIds": ids, "bucket": f"geometry-{bucket:02d}.json"}
        roads.append(record)
        buckets[bucket]["roads"][record["id"]] = {"paths": paths}

    matched = set(by_way) & set(tags_by_id)
    matched_named = sum(len(ids) for ids in components)
    source = {"url": source_url, "timestamp": timestamp, "sha256": metadata_hash,
              "geometry": {"indexSha256": index_hash,
                           "inputSha256": tile_index.get("input_sha256"),
                           "source": tile_index.get("source"),
                           "license": tile_index.get("license"),
                           "attribution": tile_index.get("attribution"),
                           "tileFilesSha256": tile_hasher.hexdigest(),
                           "tileCount": len(set(keys))},
              "places": {"sha256": places_hash, "inputSha256": place_data.get("input_sha256")}}
    if source_query:
        source["query"] = source_query
        source["requestMethod"] = "POST"
    coverage = {"mappedWays": len(by_way), "matchedNamedWays": matched_named,
                "unmatchedWays": len(set(by_way) - matched), "roadCount": len(roads)}
    index = {"version": 1, "source": source, "license": "ODbL-1.0",
             "attribution": ATTRIBUTION, "coverage": coverage, "roads": roads}
    # All inputs are validated before writing, and output is reproducible (no build clock/absolute paths).
    out = out.resolve()
    if out == tiles.resolve() or tiles.resolve() in out.parents or out == places_path.resolve().parent:
        raise ValueError("Output must be a separate roads directory, not an input directory")
    out.mkdir(parents=True, exist_ok=True)
    for filename, value in [("index.json", index)] + [(f"geometry-{i:02d}.json", b) for i, b in enumerate(buckets)]:
        (out / filename).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    (out / "README.md").write_text(
        "# Named road index\n\n"
        f"Source: {source_url}\n\nOSM tag timestamp: {timestamp}\n\n"
        + (f"Read-only Overpass POST query (`data` form field):\n\n```text\n{source_query}\n```\n\n" if source_query else "")
        +
        f"Tag JSON SHA-256: `{metadata_hash}`\n\n"
        f"Geometry index SHA-256: `{index_hash}`\n\n"
        f"Geometry original extract SHA-256: `{source['geometry']['inputSha256']}`\n\n"
        f"Geometry tile manifest SHA-256: `{source['geometry']['tileFilesSha256']}`\n\n"
        f"Places JSON SHA-256: `{places_hash}`\n\n"
        f"Coverage: {len(by_way)} mapped ways; {matched_named} matched named ways; "
        f"{len(matched) - matched_named} matched unnamed ways omitted; "
        f"{coverage['unmatchedWays']} ways absent from metadata omitted; {len(roads)} road records.\n\n"
        "Unmatched means no metadata ID join, not a claim that the road is unnamed. A name-filtered "
        "tag extract cannot distinguish genuinely unnamed roads from metadata/geometry snapshot drift.\n\n"
        "Geometry is copied from existing clipped tile paths, deduplicating only exact or reversed "
        "duplicates. No points are joined or resampled. Connected components share exact stored "
        "vertices, normalized names, nearest-place labels and layer/bridge/tunnel tags. Original node "
        "IDs are unavailable, so coincident coordinates are not proof of network connectivity. "
        "Missing grade tags mean surface layer 0. Tag and geometry snapshots may differ.\n\n"
        "Locality is approximate: Near the nearest actual city/town/village in places.json at the "
        "way's longest-path midpoint, not an official address or administrative boundary. Component "
        "anchors are halfway along the longest original clip path using latitude-aware approximate "
        "lengths. Bounds cover all paths. Roads use minimum constituent way ID; bucket = ID modulo 32.\n\n"
        "The tile manifest digest hashes sorted UTF-8 lines of filename, NUL, file SHA-256, newline. "
        "Source URL, source timestamp, and exact metadata/geometry/place hashes live in index.json. "
        "Rerun scripts/build-road-index.py --help for reproducible CLI options.\n\n"
        f"License: ODbL-1.0. {ATTRIBUTION}\n", encoding="utf8")
    print(json.dumps(coverage, sort_keys=True))
    return index


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--tiles", type=Path, required=True)
    parser.add_argument("--places", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-timestamp")
    parser.add_argument("--source-query", help="Exact read-only Overpass POST query used to acquire the tag JSON")
    args = parser.parse_args()
    try:
        build(args.metadata, args.tiles, args.places, args.out, args.source_url, args.source_timestamp, args.source_query)
    except (ValueError, OSError, TypeError, KeyError) as error:
        parser.exit(1, f"Road index build failed: {error}\n")
