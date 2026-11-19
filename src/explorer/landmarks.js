import {project} from './geo.js';

// Locations from the bundled OSM extract. Geometry is an artistic reconstruction,
// not an OSM boundary, measured cliff profile, or photogrammetric model.
export const LANDMARKS = [
 {id:'w133131985',name:'7 Coloured Earth - Chamarel',kind:'3D landmark',center:[57.373552,-20.440316],scenery:'dunes',view:32,radius:8,
  aliases:'seven coloured earth seven colored earth 7 colors 7 colours terres des sept couleurs terres des 7 couleurs',
  description:'Seven Coloured Earth · Artistic 3D reconstruction of coloured dunes. Location from OpenStreetMap; shapes and colours are illustrative.'},
 {id:'n248643391',name:'Chamarel Waterfall',kind:'3D landmark',center:[57.3859833,-20.4430526],scenery:'waterfall',view:75,radius:20,
  aliases:'chamarel falls chamarel waterfalls cascade de chamarel cascades',
  description:'Chamarel Waterfall · Artistic 3D reconstruction of cliffs, water and forest. Location from OpenStreetMap; local relief is illustrative, not surveyed.'},
 {id:'n828423453',name:'Le Morne Brabant',kind:'3D landmark',center:[57.3213024,-20.4540752],scenery:'mountain',view:210,radius:90,placement:'relief',
  aliases:'morne brabant le morne mountain cultural landscape',
  description:'Le Morne Brabant · A cultural landscape associated with resistance to slavery. This rugged mountain model is illustrative, not surveyed; its relief is not added twice to the DEM.'},
 {id:'n1891384067',name:'Trou aux Cerfs',kind:'3D landmark',center:[57.5114969,-20.3179077],scenery:'crater',view:65,radius:24,placement:'level',
  aliases:'trou-aux-cerfs curepipe volcano crater volcan cratere',
  description:'Trou aux Cerfs · A forested volcanic crater at Curepipe. This raised bowl and woodland are illustrative scenery, not an excavation of the DEM or a surveyed crater profile.'},
 {id:'r1789151',name:'Ganga Talao',kind:'3D landmark',center:[57.4921158,-20.4181020],scenery:'lake',view:75,radius:28,placement:'level',
  aliases:'grand bassin ganga talao sacred lake lac sacre',
  description:'Ganga Talao (Grand Bassin) · A sacred Hindu lake. Level water, wooded banks and simple pavilions are illustrative; they are not replicas of individual temples or statues.'},
];
export function withLandmarks(places){
 const ids=new Set(LANDMARKS.map(p=>p.id));
 return [...places.filter(p=>!ids.has(p.id)),...LANDMARKS];
}
export function nearbyLandmarks(target,view,overview=false){
 if(overview||view>450)return [];
 return LANDMARKS.filter(site=>{const p=project(site.center);return Math.hypot(p.x-target.x,p.z-target.z)<Math.min(450,view*1.5+60);});
}
// Replace only invented roadside vegetation, never mapped buildings or roads.
export function sceneryVegetationArea(point){
 return LANDMARKS.some(site=>{const p=project(site.center);return Math.hypot(p.x-point.x,p.z-point.z)<site.radius;});
}
