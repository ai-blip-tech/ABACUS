import type {FurnitureKind} from './furniture';
/** Explicit CAD names only. Generic sections and contradictory labels stay unknown. */
export function dxfFurnitureKind(name:string):FurnitureKind|null{
 const s=name.toLowerCase().replace(/ё/g,'е');
 const rules:[FurnitureKind,RegExp][]=[['bed',/кроват|\bbed\b/],['sofa',/диван|sofa|couch/],['armchair',/кресл|armchair/],['chair',/стул|\bchair\b/],['wardrobe',/гардероб|шкаф|wardrobe|cabinet/],['dresser',/комод|dresser/],['shelf',/стеллаж|полк|shelving/],['kitchen',/кух|kitchen/],['bath',/ванн|bathtub/],['toilet',/унитаз|toilet|\bwc\b/],['shower',/душ|shower/],['sink',/раковин|умывальн|мойк|sink/],['fridge',/холодильник|fridge|refrigerator/],['nightstand',/прикроватн|nightstand/],['tv_stand',/тв.?тумб|тумб.*(?:тв|телевиз)|tv.?stand/],['tv',/панель тв|телевизор|television/],['desk',/письмен|\bdesk\b/],['table',/стол|table/],['rug',/ковер|rug/],['lamp',/светильник|lamp/]];
 let kinds=rules.filter(([k,r])=>(k==='shower'?/(?:^|[^а-яa-z])душ|\bshower\b/:r).test(s)).map(([k])=>k);
 // Specific compound terms are not contradictions.
 if(kinds.includes('desk'))kinds=kinds.filter(k=>k!=='table');
 if(kinds.includes('tv_stand'))kinds=kinds.filter(k=>k!=='tv');
 if(kinds.includes('sink')||kinds.includes('fridge'))kinds=kinds.filter(k=>k!=='kitchen');
 return kinds.length===1?kinds[0]:null;
}
