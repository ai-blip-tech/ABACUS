import {tileShape} from './tile-shape.mjs';
import type {FloorTile} from './measured-plan/measure-floor-finishes';
import approved from './wall-elevations/products.json' with {type:'json'};
export function floorTileFromProduct(p:any):FloorTile{
 const params=p.parameters||[],value=(rx:RegExp)=>params.find((x:any)=>rx.test(x.name))?.value||'',known=approved.find(t=>t.id==='norrmobler:'+p.sourceId||t.id===p.id),raw=value(/^Размер плитки$/i),parts=raw.replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)?.map(Number)||[],factor=/мм|mm/i.test(raw)?1:/см|cm/i.test(raw)?10:null;
 const width=known?known.width*1000:parts.length>=2&&factor?parts[0]*factor:p.widthMm,height=known?known.height*1000:parts.length>=2&&factor?parts[1]*factor:p.depthMm;
 if(![width,height].every(n=>Number.isFinite(n)&&n>=10&&n<=10000))throw Error('У поставщика не указаны достоверные размеры плитки');
 const retail=Number(value(/Розничная цена за кв м/i).replace(',','.'));
 return{tileShape:tileShape(p)||undefined,id:p.id,name:p.name,article:p.article,brand:p.brand,url:p.url,widthMm:width,heightMm:height,thicknessMm:Number(value(/Толщина.*мм/i).replace(',','.'))||undefined,image:'/api/catalog/floor-texture?id='+encodeURIComponent(p.id),textureReviewed:!!known,jointMm:2,grout:'#c8c2b6',price:retail>0?retail:undefined,priceUnit:retail>0?'м²':undefined};
}
