type Product={parameters:{name:string;value:string}[]};
const norm=(s:string)=>s.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
/** Supplier design, not product purpose (which also describes sanitary fixtures). */
export function tileDesigns(p:Product){return [...new Set(p.parameters.filter(v=>/^(дизайн|рисунок|имитация|тип рисунка)$/i.test(v.name.trim())).flatMap(v=>v.value.split(/[,;|]/)).map(v=>v.trim()).filter(Boolean))];}
export function matchesTileDesign(p:Product,values:string[]){return !values.length||tileDesigns(p).some(v=>values.some(value=>norm(value)===norm(v)));}
export function prioritizeRecent<T extends {id:string}>(products:T[],ids:string[]){const ranks=new Map(ids.map((id,i)=>[id,i]));return [...products].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));}
