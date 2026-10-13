import type { ItCatalogProduct } from "./types";

export const catalogCategories = [
  "sofa",
  "armchair",
  "chair",
  "ottoman",
  "table",
  "dining_table",
  "coffee_table",
  "desk_table",
  "bed",
  "nightstand",
  "dresser",
  "cabinet",
  "shelving",
  "tv_stand",
  "rug",
  "light",
  "decor",
] as const;

export type CatalogCategory = typeof catalogCategories[number];
export type CatalogDimensions = {
  unit: "mm" | "cm";
  widthMin: number | null;
  widthMax: number | null;
  depthMin: number | null;
  depthMax: number | null;
  heightMin: number | null;
  heightMax: number | null;
};

export type SearchCatalogArguments = {
  textQuery: string | null;
  category: CatalogCategory | null;
  subtype: string | null;
  color: string | null;
  material: string | null;
  style: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: "RUB" | null;
  dimensions: CatalogDimensions | null;
  brand: string | null;
  availability: "in_stock" | "any" | null;
  variants: string[];
  sort: "price_asc" | "price_desc" | "relevance";
  page: number;
  pageSize: number;
};

export type OnoCatalogToolResult = {
  products: ItCatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  appliedFilters?: Record<string, unknown>;
  recommendations?: Array<{ productId: string; score: number; reasons: string[] }>;
  unsupportedFilters?: string[];
  error?: string;
};

export const approvedProductUrl = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "norrmobler.ru" || url.hostname.endsWith(".norrmobler.ru")) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"], minimum: 0 } as const;

export const onoToolDefinitions = [
  {
    type: "function",
    name: "knowledge_search",
    description: "Ищет только в утверждённой и изолированной базе знаний текущего сайта: правила Room Design, экспертные материалы или подтверждённые правила NORR Møbler. Используй для общих вопросов о материалах, уходе, эргономике и правилах сервиса; характеристики конкретного товара проверяй catalog tools.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 2, maxLength: 300 },
        maxResults: { type: "integer", minimum: 1, maximum: 6 },
      },
      required: ["query", "maxResults"],
    },
  },
  {
    type: "function",
    name: "search_catalog",
    description: "Ищет реальные товары в каталоге. Используй для любого запроса о подборе, наличии, цене, цвете или размерах. Размеры и цены передавай только в соответствующих полях.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        textQuery: nullableString,
        category: { type: ["string", "null"], enum: [...catalogCategories, null] },
        subtype: nullableString,
        color: nullableString,
        material: nullableString,
        style: nullableString,
        priceMin: nullableNumber,
        priceMax: nullableNumber,
        currency: { type: ["string", "null"], enum: ["RUB", null] },
        dimensions: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                unit: { type: "string", enum: ["mm", "cm"] },
                widthMin: nullableNumber,
                widthMax: nullableNumber,
                depthMin: nullableNumber,
                depthMax: nullableNumber,
                heightMin: nullableNumber,
                heightMax: nullableNumber,
              },
              required: ["unit", "widthMin", "widthMax", "depthMin", "depthMax", "heightMin", "heightMax"],
            },
          ],
        },
        brand: nullableString,
        availability: { type: ["string", "null"], enum: ["in_stock", "any", null] },
        variants: { type: "array", items: { type: "string" }, maxItems: 8 },
        sort: { type: "string", enum: ["price_asc", "price_desc", "relevance"] },
        page: { type: "integer", minimum: 1, maximum: 20 },
        pageSize: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["textQuery", "category", "subtype", "color", "material", "style", "priceMin", "priceMax", "currency", "dimensions", "brand", "availability", "variants", "sort", "page", "pageSize"],
    },
  },
  {
    type: "function",
    name: "get_product_details",
    description: "Возвращает подтвержденные характеристики одного или нескольких товаров по ID.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { productIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 } },
      required: ["productIds"],
    },
  },
  {
    type: "function",
    name: "compare_products",
    description: "Возвращает сопоставимые подтвержденные свойства двух-пяти товаров без домыслов.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { productIds: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 } },
      required: ["productIds"],
    },
  },
  {
    type: "function",
    name: "get_product_url",
    description: "Возвращает разрешенную каноническую ссылку на товар по его ID.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { productId: { type: "string", minLength: 1 } },
      required: ["productId"],
    },
  },
] as const;

export const onoWebSearchToolDefinition = {
  type: "web_search",
  search_context_size: "low",
  external_web_access: true,
} as const;

export const onoToolDefinitionsFor = (webSearchEnabled: boolean): readonly unknown[] => webSearchEnabled
  ? [...onoToolDefinitions, onoWebSearchToolDefinition]
  : onoToolDefinitions;

const finiteNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const limitedText = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) || null : null;

export function normalizeSearchCatalogArguments(value: unknown): SearchCatalogArguments {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawDimensions = input.dimensions && typeof input.dimensions === "object" ? input.dimensions as Record<string, unknown> : null;
  const unit = rawDimensions?.unit === "cm" ? "cm" : "mm";
  const dimension = (key: string) => {
    const number = finiteNumber(rawDimensions?.[key]);
    return number === null ? null : Math.round(number * (unit === "cm" ? 10 : 1));
  };
  const category = catalogCategories.includes(input.category as CatalogCategory) ? input.category as CatalogCategory : null;
  const page = Math.min(20, Math.max(1, Math.round(finiteNumber(input.page) || 1)));
  const pageSize = Math.min(10, Math.max(1, Math.round(finiteNumber(input.pageSize) || 5)));
  const sort = input.sort === "price_desc" || input.sort === "relevance" ? input.sort : "price_asc";
  const dimensions = rawDimensions ? {
    unit: "mm" as const,
    widthMin: dimension("widthMin"),
    widthMax: dimension("widthMax"),
    depthMin: dimension("depthMin"),
    depthMax: dimension("depthMax"),
    heightMin: dimension("heightMin"),
    heightMax: dimension("heightMax"),
  } : null;
  return {
    textQuery: limitedText(input.textQuery),
    category,
    subtype: limitedText(input.subtype, 80),
    color: limitedText(input.color, 80),
    material: limitedText(input.material, 80),
    style: limitedText(input.style, 80),
    priceMin: finiteNumber(input.priceMin),
    priceMax: finiteNumber(input.priceMax),
    currency: input.currency === "RUB" ? "RUB" : null,
    dimensions,
    brand: limitedText(input.brand, 80),
    availability: input.availability === "in_stock" ? "in_stock" : "any",
    variants: Array.isArray(input.variants) ? input.variants.map((item) => limitedText(item, 80)).filter((item): item is string => Boolean(item)).slice(0, 8) : [],
    sort,
    page,
    pageSize,
  };
}
