export type CatalogFilterProduct = {
  name: string;
  category: string;
  subtype: string;
};

const normalizeCatalogText = (value = "") => value
  .toLocaleLowerCase("ru-RU")
  .replace(/ё/g, "е")
  .replace(/\s+/g, " ")
  .trim();

const belongsToTableCategory = (categoryText: string) => /(?:^|[\s/])стол(?:ы|ов)?(?:$|[\s/])/.test(categoryText);

export const matchesCatalogType = (product: CatalogFilterProduct, type: string, categoryTrail: string) => {
  const text = normalizeCatalogText(`${product.name} ${product.subtype} ${product.category} ${categoryTrail}`);
  const categoryText = normalizeCatalogText(`${product.category} ${categoryTrail}`);
  if (type === "sofa") return /диван|модул|кушет/.test(text);
  if (type === "armchair") return /кресл/.test(text);
  if (type === "chair") return /стул/.test(text);
  if (type === "ottoman") return /пуф|банкетк|оттоманк/.test(text);
  if (type === "dining_table") return /обеденн/.test(text);
  if (type === "coffee_table") return belongsToTableCategory(categoryText) && /журнальн|приставн/.test(text);
  if (type === "desk_table") return /письменн|туалетн/.test(text);
  if (type === "table") return /стол/.test(text) && !/стул|консол/.test(text);
  if (type === "bed") return /кроват/.test(text) && !/прикроват/.test(text);
  if (type === "nightstand") return /прикроватн.{0,30}(?:тумб|стол)|(?:тумб|стол).{0,30}прикроватн/.test(text);
  if (type === "dresser") return /комод/.test(text);
  if (type === "cabinet") return /шкаф|гардероб|буфет|витрин/.test(text);
  if (type === "shelving") return /стеллаж/.test(categoryText) || /стеллаж|этажерк/.test(text);
  if (type === "tv_stand") return /(?:тв|tv|телевиз)[\s-]*(?:тумб|стойк)|тумб[^/]{0,45}(?:тв|tv|телевиз)/.test(text);
  if (type === "rug") return /ковер|ковры|шкура/.test(categoryText);
  if (type === "light") return /свет|люстр|торшер|ламп/.test(text);
  if (type === "decor") return /зеркал|аксессуар(?:ы)? для дома|статуэт|ваз|подуш/.test(categoryText);
  return false;
};
