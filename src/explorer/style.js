/** Deterministic styling inspired by the user's reference screenshots.
 * This module NEVER claims roof/façade details are surveyed facts.
 */
export const THEMES = {
  little:{name:'Little World',land:'#a9bf8b',inland:'#9cb47d',ridge:'#71966b',highland:'#58785a',shore:'#d7d6ad',roads:'#8c9690',sidewalk:'#c8cbb6',park:'#95b877',water:'#82b9c8',walls:['#f0e5c7','#dfd8bc','#e9e2d2','#c9d2c4'],roofs:['#c47c58','#e0c99b','#708f83','#8d9e9c','#e9dfbd','#cead79']},
  tropical:{name:'Tropical',land:'#8cba86',inland:'#76a97b',ridge:'#54796b',highland:'#395e58',shore:'#ecd4a6',roads:'#989e96',sidewalk:'#c9d2b5',park:'#65a875',water:'#54b4c5',walls:['#f2e5c7','#c5d9ca','#eee0ce','#c6c9b7'],roofs:['#c97865','#d6c19a','#6e9f9d','#a79d83','#dcc9ad','#d7aa79']},
  dusk:{name:'Evening',land:'#8b9b87',inland:'#778f7e',ridge:'#59736a',highland:'#4c605d',shore:'#d2b99c',roads:'#898b89',sidewalk:'#bdbaaf',park:'#769580',water:'#648fa4',walls:['#e0ccba','#bfbaad','#d5c8b9','#aebdab'],roofs:['#a86456','#bd9875','#7a8988','#878980','#d6b999','#b58a67']}
};
export function selectLook(building){const id=Number(building.id)||0;const seed=(Math.imul(id,1664525)+1013904223)>>>0;return {
 wall:id%4,roof:id%6,pitched:(seed%11<4),windowStyle:Math.floor(seed/11)%3,
 equipment:seed%17<3
};}
export function windowSlots(edgeLength,height,style){if(!Number.isFinite(edgeLength)||edgeLength<.8||height<.7)return [];
 const count=Math.max(1,Math.min(9,Math.floor(edgeLength/.42)));
 const levels=Math.max(1,Math.min(13,Math.floor(height/.31)));
 const slots=[];for(let row=0;row<levels;row++)for(let col=0;col<count;col++){
   const t=(col+.5)/count;const y=(row+.38)/levels*height;
   slots.push({t,y,height:Math.min(.21,height/levels*.5),width:Math.min(.17,edgeLength/count*.43),style});
 }
 return slots;
}
