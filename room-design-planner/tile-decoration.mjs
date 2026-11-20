import {tileProduct} from './tile-products.mjs';
/** Rotate the decor without changing the footprint or the cutting masks. */
export function rotateTileDecor(piece){
 const product=tileProduct(piece.productId),step=Math.abs(product.widthMm-product.heightMm)<.1?90:180;
 return {...piece,angle:((piece.angle||0)+step)%360};
}
/** One-for-one replacement preserves the existing physical grid and grout. */
export function replaceTileDecor(piece,productId){
 const old=tileProduct(piece.productId),next=tileProduct(productId);
 if(Math.abs(old.widthMm-next.widthMm)>.1||Math.abs(old.heightMm-next.heightMm)>.1)throw Error(`Для замены одной плиты выберите формат ${old.widthMm} × ${old.heightMm} мм`);
 return {...piece,productId};
}
