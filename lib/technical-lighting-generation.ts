export const TECHNICAL_LIGHTING_TEMPLATE_VERSION = "lighting-manifest-v2";
export const OPENAI_IMAGE_INPUT_LIMIT = 16;

export type LightingReferenceInput = {
  assetId?: string;
  productId?: string;
  article?: string;
  sourceKind?: "catalog" | "user" | "project";
  source?: string;
};

export type LightingProductInput = {
  assetId?: string;
  productId?: string;
  name?: string;
  article?: string;
  type?: string;
  widthMm?: number | null;
  lengthMm?: number | null;
  source?: string;
  quantity?: number;
};

export type LightingBriefInput = {
  referenceImages?: string[];
  referenceManifest?: LightingReferenceInput[];
  products?: LightingProductInput[];
};

export type OrderedLightingReference = {
  assetId: string;
  productId: string;
  article: string;
  sourceKind: "catalog" | "user" | "project";
  source: string;
  providerIndex: number;
};

const cleanId = (value: unknown, fallback: string) => {
  const normalized = typeof value === "string" ? value.trim().slice(0, 180) : "";
  return normalized || fallback;
};

export function orderLightingReferences(brief: LightingBriefInput, baseImageCount: 1 | 2) {
  const products = Array.isArray(brief.products) ? brief.products : [];
  const suppliedManifest = Array.isArray(brief.referenceManifest) ? brief.referenceManifest : [];
  const legacySources = Array.isArray(brief.referenceImages) ? brief.referenceImages : [];
  const rawReferences: LightingReferenceInput[] = suppliedManifest.length
    ? suppliedManifest
    : legacySources.map((source, index) => ({
        assetId: products[index]?.assetId || `legacy-reference-${index + 1}`,
        productId: products[index]?.productId || products[index]?.article || `legacy-product-${index + 1}`,
        article: products[index]?.article,
        sourceKind: source.startsWith("/api/projects/") ? "project" : source.startsWith("data:") ? "user" : "catalog",
        source,
      }));

  if (products.length !== rawReferences.length) {
    throw new Error(`Количество товаров (${products.length}) не совпадает с количеством референсов (${rawReferences.length}).`);
  }
  if (baseImageCount + rawReferences.length > OPENAI_IMAGE_INPUT_LIMIT) {
    const maximum = OPENAI_IMAGE_INPUT_LIMIT - baseImageCount;
    throw new Error(`Для этого режима можно передать не более ${maximum} референсов (${OPENAI_IMAGE_INPUT_LIMIT} изображений вместе со служебными). Сейчас выбрано ${rawReferences.length}.`);
  }

  const seen = new Set<string>();
  const references = rawReferences.map((reference, index): OrderedLightingReference => {
    const assetId = cleanId(reference.assetId, "");
    const source = typeof reference.source === "string" ? reference.source.trim() : "";
    if (!assetId) throw new Error(`У референса ${index + 1} отсутствует assetId.`);
    if (seen.has(assetId)) throw new Error(`Референс ${assetId} передан повторно.`);
    if (!source) throw new Error(`У референса ${assetId} отсутствует изображение.`);
    seen.add(assetId);
    return {
      assetId,
      productId: cleanId(reference.productId, products[index]?.productId || products[index]?.article || `product-${index + 1}`),
      article: cleanId(reference.article, products[index]?.article || ""),
      sourceKind: reference.sourceKind === "project" || reference.sourceKind === "user" ? reference.sourceKind : "catalog",
      source,
      providerIndex: baseImageCount + index + 1,
    };
  });

  for (let index = 0; index < products.length; index += 1) {
    const expectedAssetId = cleanId(products[index]?.assetId, references[index]?.assetId || "");
    if (!expectedAssetId || expectedAssetId !== references[index]?.assetId) {
      throw new Error(`Товар ${products[index]?.article || index + 1} не согласован с референсом ${references[index]?.assetId || index + 1}.`);
    }
  }
  return references;
}

export function lightingInventoryText(products: LightingProductInput[], references: OrderedLightingReference[]) {
  const byAsset = new Map(references.map((reference) => [reference.assetId, reference]));
  return products.map((item, index) => {
    const reference = byAsset.get(cleanId(item.assetId, references[index]?.assetId || ""));
    if (!reference) throw new Error(`Для товара ${item.article || index + 1} не найден референс.`);
    return `${Math.max(1, Math.round(item.quantity || 1))} шт. ${item.name || "Светильник"}${item.article ? `, артикул ${item.article}` : ""}${item.type ? `, тип ${item.type}` : ""}${item.widthMm && item.lengthMm ? `, габариты ${Math.round(item.widthMm)} × ${Math.round(item.lengthMm)} мм` : ""}${item.source === "reference" ? ", пользовательский референс" : ""}, asset ${reference.assetId}, эталон внешнего вида — изображение ${reference.providerIndex}`;
  }).join("; ");
}
