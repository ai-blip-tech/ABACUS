type SearchProduct={name:string;article:string;brand:string;subtype:string;color:string;material:string};
const normalize=(value:string)=>value.toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/\s+/g," ").trim();

export function matchesCatalogSearch(product:SearchProduct,query:string) {
  const haystack=normalize(`${product.name} ${product.article} ${product.brand} ${product.subtype} ${product.color} ${product.material}`);
  return normalize(query).split(" ").every(token=>haystack.includes(token));
}

export function catalogDiscount(product:{price:number;oldPrice:number}) {
  return Number.isFinite(product.price)&&Number.isFinite(product.oldPrice)&&product.price>0&&product.oldPrice>product.price ? (product.oldPrice-product.price)/product.oldPrice : 0;
}
