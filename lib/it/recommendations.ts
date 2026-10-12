import type { ItCatalogProduct } from "./types.ts";
import type { SearchCatalogArguments } from "./tool-contracts.ts";

const normalized = (value: unknown) => String(value || "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();

export function rankCatalogRecommendations(products: ItCatalogProduct[], input: SearchCatalogArguments) {
  return products.map((product, originalIndex) => {
    let score = 0;
    const reasons: string[] = [];
    const matchText = (wanted: string | null, actual: unknown, label: string, weight: number) => {
      if (!wanted) return;
      const left = normalized(wanted);
      const right = normalized(actual);
      if (left && right && (right.includes(left) || left.includes(right))) {
        score += weight;
        reasons.push(label);
      }
    };
    matchText(input.color, product.color, `цвет: ${product.color}`, 4);
    matchText(input.material, product.material, `материал: ${product.material}`, 4);
    matchText(input.brand, product.brand, `бренд: ${product.brand}`, 3);
    matchText(input.subtype, product.subtype, `тип: ${product.subtype}`, 3);
    if (input.priceMax !== null && product.price <= input.priceMax) { score += 2; reasons.push("в пределах бюджета"); }
    if (input.priceMin !== null && product.price >= input.priceMin) score += 1;
    const dimensions = input.dimensions;
    if (dimensions?.widthMax !== null && dimensions?.widthMax !== undefined && product.widthMm !== null && product.widthMm <= dimensions.widthMax) {
      score += 3;
      reasons.push(`ширина ${product.widthMm} мм`);
    }
    if (product.available) { score += 1; reasons.push("доступен в источнике"); }
    return { product, score, reasons: reasons.slice(0, 4), originalIndex };
  }).sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex);
}
