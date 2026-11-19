export const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function searchPlaces(places,query){
 const q=normalize(query);if(q.length<2)return [];
 return places.filter(p=>normalize(p.name+' '+(p.aliases||'')).includes(q))
 .sort((a,b)=>{
  const rank=p=>normalize(p.name)===q?0:normalize(p.name).startsWith(q)?1:2;
  return rank(a)-rank(b)||a.name.localeCompare(b.name);
 }).slice(0,12);
}
export function panelAlpha(value){return 1-Math.max(0,Math.min(80,Number(value)||0))/100;}
