/** Supplier availability is separate from a downloadable model. No page scraping. */
export type ModelCatalogProduct={id?:string;hasModel3D?:boolean;model3dUrl?:string;parameters?:{name:string;value:string}[]};
export function catalogModelUrl(product:ModelCatalogProduct):string|undefined{
 const raw=product.model3dUrl?.trim();if(!raw)return;
 try{const url=new URL(raw);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{}
}
export function catalogHasModel3D(product:ModelCatalogProduct):boolean{
 return Boolean(catalogModelUrl(product)||product.hasModel3D||(product.parameters||[]).some(p=>/^(есть\s*3д\s*модель|есть\s*3d\s*модель)$/i.test(p.name.trim())&&/^(да|yes|true|1)$/i.test(p.value.trim())));
}

export function catalogModelPreviewStatus(product:ModelCatalogProduct):{ready:boolean;label:string}{
 const url=catalogModelUrl(product);
 if(url)return {ready:false,label:/\.glb(?:[?#]|$)/i.test(url)?'3D · файл ещё не проверен':'3D · требуется конвертация'};
 return {ready:false,label:catalogHasModel3D(product)?'3D · ожидаем ссылку':'3D-модель не указана'};
}
