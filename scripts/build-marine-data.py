"""Build marine API v1 from a saved Overpass snapshot, offline and stdlib-only.

Never closes an open way, simplifies a ring, or drops a broken relation member.
Any rejected marine feature fails the build before the output is written.
"""
import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path


SOURCE_URL = 'https://overpass-api.de/api/interpreter'
QUERY = ('[out:json][timeout:45];(nwr[natural=reef](-20.6,57.2,-19.9,57.9);'
         'nwr[water=lagoon](-20.6,57.2,-19.9,57.9);'
         'nwr[natural=bay][name~"lagoon|lagon",i](-20.6,57.2,-19.9,57.9););out body geom;')
REGION = (57.2, -20.6, 57.9, -19.9)
SETTLEMENTS = {'city', 'town', 'village', 'hamlet', 'quarter'}
DEFAULT_PLACES = Path(__file__).resolve().parents[1] / 'public/explorer/places.json'


def points(geometry):
    if not isinstance(geometry, list) or len(geometry) < 2:
        raise ValueError('missing or short member geometry')
    result = []
    for point in geometry:
        if not isinstance(point, dict):
            raise ValueError('invalid coordinate object')
        lon, lat = point.get('lon'), point.get('lat')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
               for v in (lon, lat)):
            raise ValueError('invalid non-finite coordinate')
        if not (REGION[0] <= lon <= REGION[2] and REGION[1] <= lat <= REGION[3]):
            raise ValueError('coordinate outside the Mauritius import region')
        result.append([lon, lat])
    return result


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(point, a, b):
    return (abs(cross(a, b, point)) <= 1e-14
            and min(a[0], b[0]) <= point[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= point[1] <= max(a[1], b[1]))


def intersects(a, b, c, d):
    ab_c, ab_d, cd_a, cd_b = cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)
    if ((ab_c > 0) != (ab_d > 0) and (cd_a > 0) != (cd_b > 0)
            and all(v != 0 for v in (ab_c, ab_d, cd_a, cd_b))):
        return True
    return any(on_segment(p, q, r) for p, q, r in ((c, a, b), (d, a, b), (a, c, d), (b, c, d)))


def validate_ring(ring):
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError('open or short ring; no closure invented')
    if len({tuple(p) for p in ring[:-1]}) < 3:
        raise ValueError('ring has fewer than three distinct vertices')
    edges = list(zip(ring, ring[1:]))
    if any(a == b for a, b in edges):
        raise ValueError('ring has a zero-length edge')
    # Subtract the origin to avoid cancellation at geographic coordinate magnitudes.
    origin = ring[0]
    area = sum(cross(origin, a, b) for a, b in edges)
    if abs(area) <= 1e-15:
        raise ValueError('degenerate ring area')
    for i, (a, b) in enumerate(edges):
        for j in range(i + 1, len(edges)):
            if j == i + 1 or (i == 0 and j == len(edges) - 1):
                continue
            if intersects(a, b, *edges[j]):
                raise ValueError('self-intersecting ring')
    return ring


def inside(point, ring):
    """Strict interior: points on an edge are not accepted as a centre or hole."""
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:]):
        if on_segment(point, a, b):
            return False
        if (a[1] > y) != (b[1] > y):
            if x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
                result = not result
    return result


def rings_intersect(a, b):
    return any(intersects(p, q, r, s) for p, q in zip(a, a[1:]) for r, s in zip(b, b[1:]))


def join_rings(fragments):
    """Join only unique shared endpoints; never bridge gaps or guess at branches."""
    closed, pending = [], []
    for fragment in fragments:
        if fragment[0] == fragment[-1]:
            closed.append(validate_ring(fragment))
        else:
            pending.append(fragment)
    degrees = Counter(tuple(end) for fragment in pending for end in (fragment[0], fragment[-1]))
    if any(degree != 2 for degree in degrees.values()):
        raise ValueError('open or ambiguous relation endpoint degree')
    while pending:
        ring = list(pending.pop(0))
        while ring[-1] != ring[0]:
            matches = [(i, fragment) for i, fragment in enumerate(pending)
                       if ring[-1] == fragment[0] or ring[-1] == fragment[-1]]
            if len(matches) != 1:
                raise ValueError('open or ambiguous relation endpoint join')
            i, fragment = matches[0]
            pending.pop(i)
            if ring[-1] == fragment[-1]:
                fragment = fragment[::-1]
            ring.extend(fragment[1:])
        closed.append(validate_ring(ring))
    return closed


def polygon_geometry(element):
    if element['type'] == 'way':
        return [[validate_ring(points(element.get('geometry')))]]
    if element['type'] != 'relation' or element.get('tags', {}).get('type') != 'multipolygon':
        raise ValueError('only polygon ways and multipolygon relations are supported')
    roles = {'outer': [], 'inner': []}
    for member in element.get('members', []):
        role = member.get('role')
        if member.get('type') != 'way' or role not in roles:
            raise ValueError('unsupported relation member type or missing ring role')
        roles[role].append(points(member.get('geometry')))
    outers, inners = join_rings(roles['outer']), join_rings(roles['inner'])
    if not outers:
        raise ValueError('missing relation outer ring')
    for i, outer in enumerate(outers):
        for other in outers[i + 1:]:
            if rings_intersect(outer, other) or inside(outer[0], other) or inside(other[0], outer):
                raise ValueError('intersecting or nested relation outer rings')
    polygons = [[outer] for outer in outers]
    for inner in inners:
        owners = [i for i, outer in enumerate(outers)
                  if not rings_intersect(inner, outer) and all(inside(point, outer) for point in inner[:-1])]
        if len(owners) != 1:
            raise ValueError('inner ring outside or intersecting an outer ring')
        polygon = polygons[owners[0]]
        for other in polygon[1:]:
            if rings_intersect(inner, other) or inside(inner[0], other) or inside(other[0], inner):
                raise ValueError('intersecting or nested inner rings')
        polygon.append(inner)
    return polygons


def representative_point(polygons):
    """Widest interior scanline midpoint, with holes subtracted by even/odd parity.

    Scan between vertex latitudes, never at a vertex. This works for concave
    surfaces and narrow coastal strips without centroid-in-hole failures.
    """
    best = None
    for polygon in polygons:
        levels = sorted({p[1] for ring in polygon for p in ring})
        for low, high in zip(levels, levels[1:]):
            y = (low + high) / 2
            intersections = sorted(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
                                   for ring in polygon for a, b in zip(ring, ring[1:])
                                   if (a[1] > y) != (b[1] > y))
            for left, right in zip(intersections[::2], intersections[1::2]):
                candidate = [(left + right) / 2, y]
                if (right > left and inside(candidate, polygon[0])
                        and not any(inside(candidate, hole) or any(on_segment(candidate, a, b)
                                    for a, b in zip(hole, hole[1:])) for hole in polygon[1:])):
                    if best is None or right - left > best[0]:
                        best = (right - left, candidate)
    if best is None:
        raise ValueError('no valid interior representative point')
    return best[1]


def nearest_name(center, places):
    lon, lat = map(math.radians, center)
    def distance(place):
        x, y = map(math.radians, place['center'])
        return (math.sin((y - lat) / 2) ** 2
                + math.cos(lat) * math.cos(y) * math.sin((x - lon) / 2) ** 2, place['id'])
    return min(places, key=distance)['name']


def marine_kind(tags):
    if tags.get('natural') == 'reef':
        return 'reef'
    if tags.get('water') == 'lagoon' or (tags.get('natural') == 'bay'
            and any(term in tags.get('name', '').lower() for term in ('lagoon', 'lagon'))):
        return 'lagoon'
    return None


def build(source, destination, places_path=DEFAULT_PLACES):
    raw = source.read_bytes()
    snapshot = json.loads(raw)
    if snapshot.get('remark'):
        raise ValueError('incomplete Overpass response has a remark; no output written')
    timestamp = snapshot.get('osm3s', {}).get('timestamp_osm_base')
    if not timestamp or not isinstance(snapshot.get('elements'), list):
        raise ValueError('missing snapshot timestamp or elements')
    places_raw = places_path.read_bytes()
    places = [p for p in json.loads(places_raw)['places']
              if p.get('kind') in SETTLEMENTS and p.get('name') and p.get('id')
              and isinstance(p.get('center'), list) and len(p['center']) == 2
              and all(isinstance(v, (int, float)) and math.isfinite(v) for v in p['center'])]
    features, rejected, seen = [], [], set()
    for element in snapshot['elements']:
        kind = marine_kind(element.get('tags', {}))
        if not kind:
            continue
        ident = str(element.get('type', '?'))[0] + str(element.get('id', '?'))
        try:
            if ident in seen:
                raise ValueError('duplicate source identifier')
            seen.add(ident)
            polygons = polygon_geometry(element)
            center = representative_point(polygons)
            coords = [p for polygon in polygons for ring in polygon for p in ring]
            name = element.get('tags', {}).get('name')
            reef_type = element.get('tags', {}).get('reef') if kind == 'reef' else None
            generated = not bool(name)
            if generated:
                if not places:
                    raise ValueError('missing settlement anchors for generated label')
                label = ('Coral reef' if reef_type == 'coral' else 'Reef') if kind == 'reef' else 'Lagoon'
                name = label + ' near ' + nearest_name(center, places)
            features.append(dict(id=ident, kind=kind, name=name, generatedLabel=generated,
                                 center=center, bounds=[min(p[0] for p in coords), min(p[1] for p in coords),
                                                        max(p[0] for p in coords), max(p[1] for p in coords)],
                                 geometry=dict(type='Polygon' if len(polygons) == 1 else 'MultiPolygon',
                                               coordinates=polygons[0] if len(polygons) == 1 else polygons),
                                 sourceUrl=f"https://www.openstreetmap.org/{element['type']}/{element['id']}"))
            if kind == 'reef':
                features[-1]['reefType'] = reef_type
        except (KeyError, TypeError, ValueError) as error:
            rejected.append(f'Rejected marine feature {ident}: {error}')
    if rejected:
        raise ValueError('\n'.join(rejected) + '\nNo output written; repair source rather than inventing geometry.')
    document = dict(version=1, source=dict(url=SOURCE_URL, timestamp=timestamp, query=QUERY,
                                         sha256=hashlib.sha256(raw).hexdigest()),
                    license='ODbL-1.0', attribution='© OpenStreetMap contributors',
                    features=sorted(features, key=lambda feature: feature['id']))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(document, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n',
                           encoding='utf8')
    print(f"Imported {len(features)} marine features; rejected 0; "
          f"places SHA-256 {hashlib.sha256(places_raw).hexdigest()}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='saved Overpass out body geom JSON; never downloaded')
    parser.add_argument('destination', type=Path, help='marine API v1 JSON output')
    parser.add_argument('--places', type=Path, default=DEFAULT_PLACES, help='existing places index used only for approximate labels')
    arguments = parser.parse_args()
    try:
        build(arguments.source, arguments.destination, arguments.places)
    except (OSError, KeyError, TypeError, ValueError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
