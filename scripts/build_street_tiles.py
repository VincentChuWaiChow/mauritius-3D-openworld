"""Generate optional offline street tiles: python build_tiles.py extract.osm.pbf dist/tiles
Requires pyosmium. Input must be an OSM extract; attribution and source hash recorded.
"""
import argparse, collections, hashlib, json, math
from pathlib import Path
import osmium

STEP=200
KINDS=set('motorway trunk primary secondary tertiary residential unclassified living_street service pedestrian track footway cycleway path steps road'.split())
def cell(p):return math.floor((p[0]-57)*STEP),math.floor((p[1]+21)*STEP)
def clip(a,b,x,y):
    """Liang-Barsky clipping in lon/lat; return nonzero intersection only."""
    xmin=57+x/STEP; ymin=-21+y/STEP
    dx=b[0]-a[0]; dy=b[1]-a[1]; t0,t1=0.,1.
    for p,q in ((-dx,a[0]-xmin),(dx,xmin+1/STEP-a[0]),(-dy,a[1]-ymin),(dy,ymin+1/STEP-a[1])):
        if abs(p)<1e-14:
            if q < -1e-12:return
        elif p<0:t0=max(t0,q/p)
        else:t1=min(t1,q/p)
        if t1<=t0:return
    out=[(round(a[0]+dx*t,6),round(a[1]+dy*t,6)) for t in (t0,t1)]
    if out[0]!=out[1]:return out

def split_line(points):
    parts=collections.defaultdict(list)
    for a,b in zip(points,points[1:]):
        xa,ya=cell(a);xb,yb=cell(b)
        for x in range(min(xa,xb),max(xa,xb)+1):
            for y in range(min(ya,yb),max(ya,yb)+1):
                seg=clip(a,b,x,y)
                if seg:
                    runs=parts[x,y]
                    if runs and runs[-1][-1]==seg[0]:runs[-1].append(seg[1])
                    else:runs.append(seg)
    return parts

def make(source,dest):
    tiles=collections.defaultdict(lambda:{'roads':[],'buildings':[],'parks':[]})
    ways=collections.Counter()
    class Handler(osmium.SimpleHandler):
        def way(self,w):
            kind=w.tags.get('highway','')
            road=kind.removesuffix('_link') in KINDS
            building=w.tags.get('building','no')!='no' and w.is_closed()
            if not (road or building):return
            if any(not n.location.valid() for n in w.nodes):return
            pts=[(round(n.lon,6),round(n.lat,6)) for n in w.nodes]
            if len(pts)<2 or not any(57.18<p[0]<57.85 and -20.56<p[1]<-19.94 for p in pts):return
            if building and len(set(pts))>=3:
                xs,ys=zip(*pts)
                key=cell(((min(xs)+max(xs))/2,(min(ys)+max(ys))/2))
                data={'id':w.id,'points':pts}
                for field,tag in (('name','name'),('height','height'),('levels','building:levels')):
                    if w.tags.get(tag):data[field]=w.tags.get(tag)
                tiles[key]['buildings'].append(data);ways['buildings']+=1
            if road:
                for key,runs in split_line(pts).items():
                    for run in runs:tiles[key]['roads'].append({'id':w.id,'kind':kind,'points':run})
                ways['roads']+=1
    Handler().apply_file(str(source),locations=True)
    dest.mkdir(parents=True,exist_ok=True)
    def write(path,d):path.write_text(json.dumps(d,separators=(',',':'),ensure_ascii=False),encoding='utf8')
    keys=[]
    for (x,y),val in sorted(tiles.items()):
        key=f'{x}_{y}';keys.append(key);write(dest/(key+'.json'),val)
    meta={'source':'OpenStreetMap contributors','license':'ODbL-1.0','attribution':'https://www.openstreetmap.org/copyright','input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'origin':[57,-21],'cellsPerDegree':STEP,'counts':dict(ways),'keys':keys}
    write(dest/'index.json',meta)
    print(ways,len(keys),'tiles')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('dest',type=Path)
    a=p.parse_args();make(a.source,a.dest)
