#!/usr/bin/env python3
"""Deterministic, tileable procedural textures informed by Mauritius photographic references.
No third-party photographs are copied into the generated material textures.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

OUT = Path(__file__).resolve().parent.parent / 'public' / 'textures'
OUT.mkdir(parents=True, exist_ok=True)
N = 256
P = 8
rng = np.random.default_rng(4827)
y, x = np.mgrid[0:N, 0:N]


def periodic_noise(seed, strengths):
    random = np.random.default_rng(seed)
    noise = np.zeros((N, N), dtype=np.float32)
    for (freq, strength) in strengths:
        for _ in range(5):
            fx = int(random.integers(-freq, freq + 1))
            fy = int(random.integers(-freq, freq + 1))
            if fx == fy == 0:
                fx = 1
            phase = random.uniform(0, 2 * np.pi)
            noise += (np.sin((x * fx + y * fy) * 2 * np.pi / N + phase) * strength / 5)
    return noise


def rgb(base, noise, tint=(1, 1, 1)):
    base = np.array(base, dtype=float)
    pattern = np.stack([noise * t for t in tint], axis=-1)
    arr = np.clip(base[None,None,:] + pattern, 0, 255).astype('uint8')
    return Image.fromarray(arr, 'RGB')


def weighted(base, noise, tint=(1,1,1)):
    return np.clip(np.array(base, dtype=float) + noise[...,None]*np.array(tint), 0,255).astype('uint8')

fine = periodic_noise(1, [(15,3), (34,3), (77,2)])
medium = periodic_noise(2, [(2,12), (5,8), (10,6), (25,3)])
coarse = periodic_noise(3, [(2,25), (4,14), (8,7), (20,3)])
terrain = []
# 0 lagoon: coral / reef cloud patterns and bright shallow-water wavelets
reef = periodic_noise(7, [(2,40), (5,20), (10,9), (20,4)])
reefPatch = (reef < -7).astype(float)
reefFoam = 14 * np.maximum(0, np.sin((x*7 + y*2)*2*np.pi/N + .18*reef))**18
water = weighted([79, 180, 184], reef*0.85 + reefFoam, (0.45,1.,0.85))
water[reefPatch > .5] = np.clip(water[reefPatch > .5] * [.7,.83,.74],0,255).astype('uint8')
terrain.append(Image.fromarray(water))
# 1 beach: warm white coral sand with tiny grains
sand = periodic_noise(8, [(2,6),(8,4),(22,3),(60,3)])
terrain.append(rgb([240,224,185], sand, (1,.93,.83)))
# 2 cane: narrow dark crop rows, interrupted by organic variation
cane = periodic_noise(9, [(2,8),(7,8),(19,3)])
rows = (np.sin(2*np.pi*(x*20 + y*2)/N + cane*.11)*17) + np.sin(2*np.pi*y*4/N)*6
terrain.append(Image.fromarray(weighted([117,166,80], cane+rows, (.6,.95,.48))))
# 3 forest: broad mottled canopy clumps
forest = periodic_noise(10, [(4,35),(9,16),(18,9),(34,3)])
terrain.append(Image.fromarray(weighted([75,128,67], forest, (.6,1.,.43))))
# 4 basalt: rough dark volcanic rock with narrow fracture-like grains
basalt = periodic_noise(11, [(3,16),(7,12),(20,7),(42,3)])
veins = -21 * np.maximum(0,np.cos((x*5 + y*2)*2*np.pi/N + basalt*.035))**25
terrain.append(Image.fromarray(weighted([107,115,108], basalt+veins, (.92,1.,.92))))
# 5 colored volcanic earth: subtle Chamarel-inspired layers, not geolocated truth
soil = periodic_noise(12, [(2,15),(5,9),(13,3)])
banding = np.sin((y*3.3 + x*.65)*2*np.pi/N + soil*.038)
ore = np.zeros((N,N,3),dtype=np.float32)
ore[...,0] = 175 + 29*banding + soil*.7
ore[...,1] = 119 + 18*banding + soil*.4
ore[...,2] = 93 - 15*banding + soil*.9
terrain.append(Image.fromarray(np.uint8(np.clip(ore,0,255))))
# 6 asphalt: compact fine-grain gray, not an invented road geometry
asphalt = periodic_noise(13, [(5,5),(19,5),(67,4)])
terrain.append(rgb([156,157,150], asphalt, (1,1,1)))
# 7 grass/scrub: bright green patches
scrub = periodic_noise(14, [(3,23),(11,9),(24,5)])
terrain.append(Image.fromarray(weighted([153,177,110], scrub, (.85,1.,.7))))

buildings = []
# 0 stucco wall: sandy plaster with grain
stucco = periodic_noise(20,[(5,3),(19,5),(60,2)])
buildings.append(rgb([246,242,231],stucco))
# 1 urban apartment wall: softly patterned windows and columns
window = np.empty((N,N,3), dtype=np.uint8); window[:] = [242,237,226]
for yy in range(12,N,39):
    for xx in range(16,N,35):
        window[yy:yy+21, xx:xx+18] = [138,167,170]
        window[yy:yy+2, xx:xx+18] = [210,208,199]
        window[yy:yy+21, xx:xx+2] = [222,222,216]
buildings.append(Image.fromarray(window))
# 2 heritage / old masonry: rhythmic blocks and pale mortar lines
brick = np.empty((N,N,3),dtype=np.uint8); brick[:] = [218,201,187]
brick[(y%35)<3] = [237,229,215]
offset = ((y//35)%2)*28
brick[((x+offset)%57)<3] = [237,229,215]
buildings.append(Image.fromarray(brick))
# 3 warehouse / glass-and-metal walls
metalwall = np.empty((N,N,3),dtype=np.uint8)
ridge = (np.sin(2*np.pi*x*18/N)*9 + periodic_noise(23,[(11,2),(33,2)]))
metalwall[:] = weighted([214,227,228],ridge,(1,1,1))
metalwall[((x+8)%56)<9] = [163,190,194]
buildings.append(Image.fromarray(metalwall))
# 4 flat concrete roofs: pale gray fine cracks
roof = periodic_noise(24,[(5,6),(16,4),(56,3)])
buildings.append(rgb([224,225,219],roof))
# 5 terracotta roof tiles
terra = np.empty((N,N,3),dtype=np.uint8)
terraNoise = periodic_noise(25,[(4,8),(29,3)])
tilepattern = -15*((y%25)<3) -12*((x+(y//25%2)*19)%37<2)
terra[:] = weighted([230,191,170],terraNoise+tilepattern,(1,.82,.8))
buildings.append(Image.fromarray(terra))
# 6 corrugated light metal roof
metalroof = periodic_noise(26,[(5,4),(30,2)]) + np.sin(x*2*np.pi*20/N)*12
buildings.append(rgb([230,237,238],metalroof))
# 7 mixed pale concrete roof with occasional dark drainage traces
mixed = periodic_noise(27,[(3,5),(22,7),(56,3)])
roofmarks = -(np.sin(2*np.pi*(x*5-y)/N)**36)*12
buildings.append(rgb([236,226,210],mixed+roofmarks))


def make_atlas(imgs, name):
    atlas = Image.new('RGB',(N*4,N*2))
    for i, img in enumerate(imgs):
        dx=(i%4)*N; dy=(i//4)*N
        # A protected 8-pixel wrapped gutter prevents nearby atlas cells
        # from bleeding into the selected material when mipmaps are sampled.
        core = np.asarray(img.resize((N-2*P, N-2*P), Image.Resampling.BICUBIC))
        padded = np.pad(core, ((P,P),(P,P),(0,0)), mode='wrap')
        atlas.paste(Image.fromarray(padded, 'RGB'), (dx, dy))
    atlas.save(OUT/name,optimize=True)

make_atlas(terrain,'surface-atlas.png')
make_atlas(buildings,'building-atlas.png')
labels1=['Lagoon & reef','Coral sand','Sugarcane','Tropical canopy','Volcanic basalt','Colored earth','Road asphalt','Grassland']
labels2=['Stucco','Apartment windows','Masonry','Metal facade','Concrete roof','Terracotta tiles','Metal roof','Pale rooftop']
thumb=Image.new('RGB',(1040,1200),(245,246,241))
D=ImageDraw.Draw(thumb)
D.text((20,10),'MAURITIUS / PHOTO-INSPIRED PROCEDURAL MATERIALS', fill=(27,55,55))
for r,(imgs,labels) in enumerate([(terrain,labels1),(buildings,labels2)]):
    y0=58 + r*560
    D.text((20,y0-24),'SURFACES' if r==0 else 'BUILDINGS',fill=(43,71,75))
    for i,(im,lbl) in enumerate(zip(imgs,labels)):
        xx=12+(i%4)*257; yy=y0+(i//4)*259
        thumb.paste(im.resize((245,225)),(xx,yy))
        D.text((xx+4,yy+228),lbl,fill=(27,55,55))
thumb.save(OUT/'material-reference-sheet.png',optimize=True)
print([(p.name,p.stat().st_size) for p in OUT.iterdir()])
