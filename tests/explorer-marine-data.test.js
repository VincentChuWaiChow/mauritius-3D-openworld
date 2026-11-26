import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const importer = new URL('../scripts/build-marine-data.py', import.meta.url).pathname;
const rawPath = new URL('../public/explorer/marine/source-overpass.json', import.meta.url);
const indexPath = new URL('../public/explorer/marine/index.json', import.meta.url);
const sourceSha = 'a34148e478c7a07e6f581a8026da4b630e517685fbcffd9d3ccb324e71459193';
const query = '[out:json][timeout:45];(nwr[natural=reef](-20.6,57.2,-19.9,57.9);nwr[water=lagoon](-20.6,57.2,-19.9,57.9);nwr[natural=bay][name~"lagoon|lagon",i](-20.6,57.2,-19.9,57.9););out body geom;';
const snapshot = elements => ({osm3s:{timestamp_osm_base:'2026-11-25T15:18:06Z'},elements});
const geom = points => points.map(([lon,lat]) => ({lon,lat}));
const closed = [[57.3,-20.4],[57.5,-20.4],[57.5,-20.2],[57.3,-20.2],[57.3,-20.4]];
const hole = [[57.38,-20.32],[57.42,-20.32],[57.42,-20.28],[57.38,-20.28],[57.38,-20.32]];
const way = (points, id=1) => ({type:'way',id,tags:{natural:'reef'},geometry:geom(points)});
const member = (points, role='outer', ref=1) => ({type:'way',ref,role,geometry:geom(points)});
const relation = members => ({type:'relation',id:2,tags:{natural:'reef',type:'multipolygon'},members});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rings = geometry => geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
const polygons = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

// Independent ray-casting oracle, not the Python importer's interior-point routine.
function insideRing([x,y], ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [ax,ay]=ring[i], [bx,by]=ring[j];
    if(((ay>y)!==(by>y)) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
  }
  return inside;
}
function insideFeature(point, feature) {
  return polygons(feature.geometry).some(([outer,...holes])=>insideRing(point,outer)&&!holes.some(ring=>insideRing(point,ring)));
}
function withTemp(run) {
  const directory=mkdtempSync(join(tmpdir(),'marine-data-test-'));
  try{return run(directory);}finally{rmSync(directory,{recursive:true,force:true});}
}
function runFixture(elements, run) {
  return withTemp(directory=>{
    const input=join(directory,'input.json'),output=join(directory,'index.json');
    writeFileSync(input,JSON.stringify(snapshot(elements)));
    const result=spawnSync('python3',[importer,input,output],{cwd:root,encoding:'utf8'});
    assert.ifError(result.error);
    return run(result,output);
  });
}

test('marine snapshot has exact provenance and reproducible bytes on repeated offline builds',()=>{
  const bytes=readFileSync(rawPath), index=JSON.parse(readFileSync(indexPath,'utf8'));
  assert.equal(sha(bytes),sourceSha);
  assert.equal(index.version,1);
  assert.deepEqual(index.source,{url:'https://overpass-api.de/api/interpreter',timestamp:'2026-11-25T15:18:06Z',query,sha256:sourceSha});
  assert.equal(index.license,'ODbL-1.0');
  assert.match(index.attribution,/OpenStreetMap contributors/);
  withTemp(directory=>{
    for(const name of ['first.json','second.json']) {
      execFileSync('python3',[importer,rawPath.pathname,join(directory,name)],{cwd:root});
      assert.deepEqual(readFileSync(join(directory,name)),readFileSync(indexPath));
    }
  });
});

test('all 39 actual source geometries, including five inner rings, are retained without rounding',()=>{
  const source=JSON.parse(readFileSync(rawPath,'utf8'));
  const index=JSON.parse(readFileSync(indexPath,'utf8'));
  assert.equal(index.features.length,39);
  assert.equal(index.features.filter(f=>f.kind==='reef').length,29);
  assert.equal(index.features.filter(f=>f.kind==='lagoon').length,10);
  assert.equal(new Set(index.features.map(f=>f.id)).size,39);
  let innerCount=0;
  for(const element of source.elements) {
    const id=element.type[0]+element.id,feature=index.features.find(f=>f.id===id);
    assert.ok(feature,id);
    assert.deepEqual(Object.keys(feature).sort(),['id','kind','name','generatedLabel','center','bounds','geometry','sourceUrl',...(feature.kind==='reef'?['reefType']:[])].sort());
    if(feature.kind==='reef')assert.equal(feature.reefType,element.tags.reef??null,'Coral classification must come from its source tag');
    const original=element.type==='way'?[element.geometry]:element.members.map(m=>m.geometry);
    const output=rings(feature.geometry);
    assert.equal(output.length,original.length,id);
    for(const ring of original) assert.ok(output.some(r=>JSON.stringify(r)===JSON.stringify(ring.map(({lon,lat})=>[lon,lat]))),`${id}: exact original ring`);
    innerCount+=polygons(feature.geometry).reduce((sum,p)=>sum+p.length-1,0);
    const points=output.flat();
    assert.deepEqual(feature.bounds,[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]);
    for(const [lon,lat] of [...points,feature.center]) assert.ok(Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=57.2&&lon<=57.9&&lat>=-20.6&&lat<=-19.9);
    assert.ok(insideFeature(feature.center,feature),`${id}: centre in surface, not a hole`);
    assert.equal(feature.sourceUrl,`https://www.openstreetmap.org/${element.type}/${element.id}`);
    assert.equal(feature.generatedLabel,!element.tags.name);
    if(element.tags.name) assert.equal(feature.name,element.tags.name);
    else assert.match(feature.name,feature.kind==='reef'?(element.tags.reef==='coral'?/^Coral reef near .+/:/^Reef near .+/):/^Lagoon near .+/);
  }
  assert.equal(innerCount,5);
});

test('generated labels use only nearest existing settlement anchors with a recorded places checksum',()=>{
  const placesBytes=readFileSync(new URL('../public/explorer/places.json',import.meta.url));
  const anchors=JSON.parse(placesBytes).places.filter(p=>['city','town','village','hamlet','quarter'].includes(p.kind));
  const distance=([a,b],[c,d])=>{
    const rad=Math.PI/180,lat1=b*rad,lat2=d*rad;
    return Math.sin((lat2-lat1)/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin((c-a)*rad/2)**2;
  };
  const features=JSON.parse(readFileSync(indexPath,'utf8')).features;
  for(const feature of features.filter(f=>f.generatedLabel)) {
    const nearest=[...anchors].sort((a,b)=>distance(feature.center,a.center)-distance(feature.center,b.center)||a.id.localeCompare(b.id))[0];
    assert.equal(feature.name,`${feature.kind==='reef'?(feature.reefType==='coral'?'Coral reef':'Reef'):'Lagoon'} near ${nearest.name}`);
  }
  const readme=readFileSync(new URL('../public/explorer/marine/README.md',import.meta.url),'utf8');
  assert.ok(readme.includes(sha(placesBytes)));
  assert.match(readme,/not official/i);
  assert.match(readme,/not.*navigation/i);
  assert.match(readme,/partial/i);
});

test('representative centre avoids a central hole instead of using the vertex mean',()=>{
  runFixture([relation([member(closed),member(hole,'inner',3)])],(result,output)=>{
    assert.equal(result.status,0,result.stderr);
    const feature=JSON.parse(readFileSync(output,'utf8')).features[0];
    assert.ok(insideFeature(feature.center,feature));
    assert.equal(rings(feature.geometry).length,2);
  });
});

test('unordered and reversed relation fragments join only through endpoints and support two outers',()=>{
  const second=closed.map(([x,y])=>[x+0.3,y]);
  const fragments=[member(closed.slice(2).toReversed(),'outer',2),member(second,'outer',3),member(closed.slice(0,3),'outer',1),member(hole,'inner',4)];
  runFixture([relation(fragments)],(result,output)=>{
    assert.equal(result.status,0,result.stderr);
    const feature=JSON.parse(readFileSync(output,'utf8')).features[0];
    assert.equal(feature.geometry.type,'MultiPolygon');
    assert.equal(feature.geometry.coordinates.length,2);
    assert.equal(rings(feature.geometry).length,3);
    assert.ok(insideFeature(feature.center,feature));
    const allPoints=rings(feature.geometry).flat();
    for(const point of [...closed,...second,...hole]) assert.ok(allPoints.some(p=>p[0]===point[0]&&p[1]===point[1]));
    const segments=ring=>ring.slice(1).map((p,i)=>[JSON.stringify(ring[i]),JSON.stringify(p)].sort().join('|'));
    assert.deepEqual(rings(feature.geometry).flatMap(segments).sort(),fragments.flatMap(m=>segments(m.geometry.map(p=>[p.lon,p.lat]))).sort(),'no invented segment across disconnected fragments');
  });
});

for(const [name,elements] of [
  ['open way',[way(closed.slice(0,-1))]],
  ['out-of-region coordinate',[way(closed.map(([x,y],i)=>[i===2?58:x,y]))]],
  ['self-intersecting way',[way([closed[0],closed[2],closed[1],closed[3],closed[0]])]],
  ['broken relation outer',[relation([member(closed.slice(0,-1))])]],
  ['open relation hole',[relation([member(closed),member(hole.slice(0,-1),'inner',2)])]],
  ['missing inner geometry',[relation([member(closed),{type:'way',ref:2,role:'inner'}])]],
  ['uncontained inner ring',[relation([member(closed),member(hole.map(([x,y])=>[x+0.25,y]),'inner',2)])]],
  ['crossing inner ring',[relation([member(closed),member(hole.map(([x,y])=>[x+0.1,y]),'inner',2)])]],
  ['nested outer rings',[relation([member(closed),member(hole,'outer',2)])]],
  ['nested inner rings',[relation([member(closed),member(hole,'inner',2),member(hole.map(([x,y])=>[57.4+(x-57.4)/2,-20.3+(y+20.3)/2]),'inner',3)])]],
  ['ambiguous endpoint branches',[relation([member(closed.slice(0,3)),member(closed.slice(2)),member(closed.slice(0,3),'outer',3)])]],
]) {
  test(`invalid geometry fails closed with diagnostics: ${name}`,()=>runFixture(elements,(result,output)=>{
    assert.notEqual(result.status,0,`${name} must not silently succeed`);
    assert.match(result.stderr,/Rejected marine feature [wr]\d+:/);
    assert.throws(()=>readFileSync(output),{code:'ENOENT'});
  }));
}

test('partial Overpass response and missing timestamp fail before writing; invalid rebuild preserves existing output',()=>withTemp(directory=>{
  const input=join(directory,'input.json'), output=join(directory,'index.json');
  for(const document of [{...snapshot([way(closed)]),remark:'runtime error: query timed out'},{elements:[way(closed)]},snapshot([way(closed.slice(0,-1))])]) {
    writeFileSync(input,JSON.stringify(document));
    writeFileSync(output,'previous valid output');
    const result=spawnSync('python3',[importer,input,output],{cwd:root,encoding:'utf8'});
    assert.ifError(result.error);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/incomplete|timestamp|Rejected marine feature/);
    assert.equal(readFileSync(output,'utf8'),'previous valid output');
  }
}));
