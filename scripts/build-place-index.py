"""Build a local OSM place/landmark search index. Requires pyosmium."""
import argparse, hashlib, json
from pathlib import Path
import osmium
def build(source, destination):
    places=[]
    def keep(tags):
        return tags.get('place') or ('peak' if tags.get('natural')=='peak' else '') or tags.get('tourism')
    def add(tags, lon, lat, ident):
        kind=keep(tags)
        if not kind or not tags.get('name') or not (57.2<=lon<=57.9 and -20.6<=lat<=-19.9): return
        places.append(dict(id=ident,name=tags['name'],kind=kind,center=[round(lon,6),round(lat,6)],
                           aliases=' '.join(tags.get(k,'') for k in ['name:en','name:fr','alt_name'])))
    class Handler(osmium.SimpleHandler):
        def node(self,n):
            if n.location.valid():add(n.tags,n.location.lon,n.location.lat,'n'+str(n.id))
        def way(self,w):
            if not keep(w.tags) or not w.tags.get('name'):return
            pts=[(n.lon,n.lat) for n in w.nodes if n.location.valid()]
            if pts:add(w.tags,sum(p[0] for p in pts)/len(pts),sum(p[1] for p in pts)/len(pts),'w'+str(w.id))
    Handler().apply_file(str(source),locations=True)
    destination.write_text(json.dumps(dict(source='OpenStreetMap contributors / Geofabrik',license='ODbL-1.0',
        input_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),places=sorted(places,key=lambda p:p['name'])),ensure_ascii=False),encoding='utf8')
    print(len(places),'searchable places')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path)
    a=p.parse_args();build(a.source,a.destination)
