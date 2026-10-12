import { GET as getCatalog } from "@/app/api/catalog/route";
import { searchOnoKnowledge } from "./knowledge-base.ts";
import type { ItCatalogProduct } from "./types";
import { approvedProductUrl, normalizeSearchCatalogArguments, type OnoCatalogToolResult } from "./tool-contracts.ts";
import type { OnoTenantProfile } from "./tenant-profiles.ts";
import { rankCatalogRecommendations } from "./recommendations.ts";

export type OnoToolExecution = {
  output: string;
  products: ItCatalogProduct[];
  resultCount: number;
};

const responsePayload = async (response: Response) => {
  const payload = await response.json() as { products?: ItCatalogProduct[]; total?: number; page?: number; limit?: number; error?: string };
  if (!response.ok) throw new Error(payload.error || "Каталог временно недоступен.");
  return payload;
};

const compactSearchProduct = (product: ItCatalogProduct): ItCatalogProduct => ({
  id: product.id,
  sourceId: product.sourceId,
  name: product.name,
  article: product.article,
  image: product.image,
  url: approvedProductUrl(product.canonicalUrl || product.url) || "",
  canonicalUrl: approvedProductUrl(product.canonicalUrl || product.url),
  price: product.price,
  oldPrice: product.oldPrice,
  available: product.available,
  category: product.category,
  subtype: product.subtype,
  color: product.color,
  material: product.material,
  brand: product.brand,
  widthMm: product.widthMm,
  depthMm: product.depthMm,
  heightMm: product.heightMm,
  updatedAt: product.updatedAt,
  provenance: product.provenance,
  description: product.description?.trim().slice(0, 600),
  parameters: product.parameters?.slice(0, 12).map((item) => ({
    name: String(item.name || "").trim().slice(0, 100),
    value: String(item.value || "").trim().slice(0, 300),
  })).filter((item) => item.name && item.value),
});

const detailedProduct = (product: ItCatalogProduct): ItCatalogProduct => ({
  ...product,
  url: approvedProductUrl(product.canonicalUrl || product.url) || "",
  canonicalUrl: approvedProductUrl(product.canonicalUrl || product.url),
  description: product.description?.trim().slice(0, 2_000),
  parameters: product.parameters?.slice(0, 60).map((item) => ({
    name: String(item.name || "").trim().slice(0, 100),
    value: String(item.value || "").trim().slice(0, 300),
  })).filter((item) => item.name && item.value),
});

const catalogByIds = async (ids: string[]) => {
  const safeIds = ids.map((id) => String(id).trim()).filter(Boolean).slice(0, 5);
  if (!safeIds.length) return [];
  const url = new URL("http://room-design.local/api/catalog");
  url.searchParams.set("ids", safeIds.join(","));
  const payload = await responsePayload(await getCatalog(new Request(url)));
  return (payload.products || []).map((product) => {
    const productUrl = approvedProductUrl(product.canonicalUrl || product.url);
    return detailedProduct({ ...product, url: productUrl || "", canonicalUrl: productUrl });
  });
};

const setNumber = (url: URL, key: string, value: number | null | undefined) => {
  if (value !== null && value !== undefined && Number.isFinite(value) && value > 0) url.searchParams.set(key, String(Math.round(value)));
};

async function searchCatalog(argumentsValue: unknown): Promise<OnoToolExecution> {
  const input = normalizeSearchCatalogArguments(argumentsValue);
  const url = new URL("http://room-design.local/api/catalog");
  url.searchParams.set("type", input.category || "sofa");
  url.searchParams.set("available", input.availability === "any" ? "0" : "1");
  url.searchParams.set("sort", input.sort === "relevance" ? "" : input.sort);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("limit", String(input.pageSize));
  if (input.textQuery) url.searchParams.set("q", input.textQuery);
  if (input.subtype) url.searchParams.set("subtype", input.subtype);
  if (input.color) url.searchParams.set("color", input.color);
  if (input.material) url.searchParams.set("material", input.material);
  if (input.brand) url.searchParams.set("brand", input.brand);
  setNumber(url, "minPrice", input.priceMin);
  setNumber(url, "maxPrice", input.priceMax);
  setNumber(url, "widthMinMm", input.dimensions?.widthMin);
  setNumber(url, "widthMaxMm", input.dimensions?.widthMax);
  setNumber(url, "depthMinMm", input.dimensions?.depthMin);
  setNumber(url, "depthMaxMm", input.dimensions?.depthMax);
  setNumber(url, "heightMinMm", input.dimensions?.heightMin);
  setNumber(url, "heightMaxMm", input.dimensions?.heightMax);

  const payload = await responsePayload(await getCatalog(new Request(url)));
  const sourceProducts = (payload.products || []).slice(0, input.pageSize).map(compactSearchProduct);
  const ranked = input.sort === "relevance" ? rankCatalogRecommendations(sourceProducts, input) : sourceProducts.map((product, originalIndex) => ({ product, score: 0, reasons: [], originalIndex }));
  const products = ranked.map((item) => item.product);
  const unsupportedFilters = [input.style ? "style" : "", input.variants.length ? "variants" : ""].filter(Boolean);
  const result: OnoCatalogToolResult = {
    products,
    total: Number(payload.total || 0),
    page: Number(payload.page || input.page),
    pageSize: input.pageSize,
    appliedFilters: input,
    recommendations: ranked.map((item) => ({ productId: item.product.id, score: item.score, reasons: item.reasons })),
    ...(unsupportedFilters.length ? { unsupportedFilters } : {}),
  };
  return { output: JSON.stringify(result), products, resultCount: products.length };
}

async function getProductDetails(argumentsValue: unknown): Promise<OnoToolExecution> {
  const input = argumentsValue && typeof argumentsValue === "object" ? argumentsValue as { productIds?: unknown } : {};
  const ids = Array.isArray(input.productIds) ? input.productIds.map(String) : [];
  const products = await catalogByIds(ids);
  return { output: JSON.stringify({ products, requestedIds: ids.slice(0, 5) }), products, resultCount: products.length };
}

async function compareProducts(argumentsValue: unknown): Promise<OnoToolExecution> {
  const input = argumentsValue && typeof argumentsValue === "object" ? argumentsValue as { productIds?: unknown } : {};
  const ids = Array.isArray(input.productIds) ? input.productIds.map(String) : [];
  const products = await catalogByIds(ids);
  const comparison = products.map((product) => ({
    id: product.id,
    name: product.name,
    article: product.article,
    price: product.price,
    available: product.available,
    brand: product.brand,
    category: product.category,
    subtype: product.subtype,
    color: product.color,
    material: product.material,
    widthMm: product.widthMm,
    depthMm: product.depthMm,
    heightMm: product.heightMm,
    description: product.description,
    parameters: product.parameters,
    url: approvedProductUrl(product.canonicalUrl || product.url),
    missingFields: ["price", "material", "widthMm", "depthMm", "heightMm"].filter((key) => {
      const value = product[key as keyof ItCatalogProduct];
      return value === null || value === undefined || value === "";
    }),
  }));
  return { output: JSON.stringify({ comparison }), products, resultCount: products.length };
}

async function getProductUrl(argumentsValue: unknown): Promise<OnoToolExecution> {
  const input = argumentsValue && typeof argumentsValue === "object" ? argumentsValue as { productId?: unknown } : {};
  const id = String(input.productId || "").trim();
  const products = await catalogByIds(id ? [id] : []);
  const product = products[0];
  return {
    output: JSON.stringify(product ? { id: product.id, name: product.name, url: approvedProductUrl(product.canonicalUrl || product.url) } : { error: "Товар не найден." }),
    products,
    resultCount: products.length,
  };
}

export async function executeOnoTool(name: string, argumentsValue: unknown, profile?: OnoTenantProfile): Promise<OnoToolExecution> {
  if (name === "knowledge_search") {
    if (!profile) throw new Error("Профиль базы знаний не определён.");
    const input = argumentsValue && typeof argumentsValue === "object" ? argumentsValue as { query?: unknown; maxResults?: unknown } : {};
    const query = String(input.query || "").trim().slice(0, 300);
    if (query.length < 2) throw new Error("Уточните тему поиска.");
    const maxResults = Math.min(6, Math.max(1, Math.round(Number(input.maxResults) || 4)));
    const records = searchOnoKnowledge(profile, query, maxResults);
    return {
      output: JSON.stringify({ records, profile: profile.siteId, knowledgeScope: ["global", profile.siteId] }),
      products: [],
      resultCount: records.length,
    };
  }
  if (name === "search_catalog") return searchCatalog(argumentsValue);
  if (name === "get_product_details") return getProductDetails(argumentsValue);
  if (name === "compare_products") return compareProducts(argumentsValue);
  if (name === "get_product_url") return getProductUrl(argumentsValue);
  throw new Error("Инструмент не разрешен.");
}
