export const FAVORITES_KEY='rd-wall-finish-favorites-v1';
export function favoriteKey(item){return item?.kind==='color'?`color:${item.system}:${String(item.code).toLowerCase()}`:`${item?.kind}:${item?.id}`;}
export function validFavorite(item){return item&&(['panel','moulding','wallpaper','tile','profile'].includes(item.kind)?typeof item.id==='string'&&item.id.length>0:item.kind==='color'&&typeof item.code==='string'&&typeof item.system==='string'&&/^#[0-9a-f]{6}$/i.test(item.hex));}
export function recentFavorite(items,item){if(!validFavorite(item))return items;return [item,...items.filter(x=>favoriteKey(x)!==favoriteKey(item))];}
function readList(storage,key){try{const list=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(list)?list:[];}catch{return [];}}
export function readFavorites(storage){let result=readList(storage,FAVORITES_KEY).filter(validFavorite);for(const c of readList(storage,'rd-wall-favorite-colors')){const item={...c,kind:'color'};if(validFavorite(item)&&!result.some(x=>favoriteKey(x)===favoriteKey(item)))result.push(item);}return result;}
