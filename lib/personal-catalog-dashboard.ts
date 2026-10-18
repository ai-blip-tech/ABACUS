import { furnitureBrandForDisplay, type FurnitureCatalogProduct } from "./furniture-catalog.ts";
import type { LightingProduct } from "./lighting-catalog";

type ProjectRow = { id: string; updated_at?: string | null; state_json?: unknown };
type JsonObject = Record<string, unknown>;

export type DashboardFurnitureItem = {
  identityKey: string;
  productId?: string;
  sku?: string;
  brandId?: string;
  brandName?: string;
  productName: string;
  imageUrl?: string;
  category?: string;
  variantLabel?: string;
  uniqueProjectCount: number;
  usageCount: number;
  lastUsedAt?: string;
  available?: boolean;
};

export type BrandUsage = {
  brandId: string;
  brandName: string;
  uniqueProductCount: number;
  projectCount: number;
  usageCount: number;
  sharePercent: number;
};

export type PersonalCatalogDashboard = {
  projectsCount: number;
  uniqueProductsCount: number;
  favoritesCount: number;
  usedBrandsCount: number;
  topProducts: DashboardFurnitureItem[];
  brands: BrandUsage[];
  furnitureState: "ready" | "empty" | "unavailable";
};

type Usage = {
  projectId: string;
  projectItemId: string;
  productId: string;
  sku?: string;
  savedBrandId?: string;
  savedBrandName?: string;
  productName: string;
  imageUrl?: string;
  category?: string;
  variantLabel?: string;
  quantity: number;
  updatedAt?: string;
};

const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const quantity = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
const normalizedBrandId = (value: string) => value.toLocaleLowerCase("ru-RU").replace(/ø/g, "o").replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "");

function parseState(value: unknown): JsonObject {
  if (typeof value === "string") {
    try { return object(JSON.parse(value)) || {}; } catch { return {}; }
  }
  return object(value) || {};
}

function variantFrom(item: JsonObject) {
  const override = object(item.proposalOverride);
  const explicit = text(override?.configuration) || text(override?.option);
  if (explicit) return explicit;
  return Array.from(new Set([text(item.referenceColor), text(item.referenceMaterial)].filter(Boolean))).join(" · ") || undefined;
}

function planUsage(project: ProjectRow, item: JsonObject): Usage | null {
  const productId = text(item.referenceProductId);
  const projectItemId = text(item.id);
  if (!productId || !projectItemId) return null;
  const savedBrandValue = text(item.referenceBrand) || text(object(item.proposalOverride)?.brand);
  const savedBrandName = savedBrandValue ? furnitureBrandForDisplay(savedBrandValue) : "";
  const source = text(item.referenceCatalogSource);
  return {
    projectId: project.id,
    projectItemId,
    productId,
    sku: text(item.referenceArticle) || undefined,
    savedBrandId: savedBrandName ? normalizedBrandId(savedBrandName) : source || undefined,
    savedBrandName: savedBrandName || undefined,
    productName: text(item.referenceName) || text(item.name) || "Предмет",
    imageUrl: text(item.referenceImage) || undefined,
    category: text(item.referenceCategory) || undefined,
    variantLabel: variantFrom(item),
    quantity: quantity(object(item.proposalOverride)?.quantity),
    updatedAt: text(project.updated_at) || undefined,
  };
}

function lightingUsage(project: ProjectRow, kind: "track" | "fixture", item: JsonObject): Usage | null {
  const product = object(item.product);
  const productId = text(product?.id);
  const placementId = text(item.id);
  if (!product || !productId || !placementId || product.isReference === true) return null;
  const savedBrandName = text(product.brand);
  const savedProvider = text(product.provider);
  return {
    projectId: project.id,
    projectItemId: `technical:${kind}:${placementId}`,
    productId,
    sku: text(product.article) || undefined,
    savedBrandId: savedProvider || (productId.startsWith("gomoon:") ? "gomoon" : undefined),
    savedBrandName: savedBrandName || (productId.startsWith("gomoon:") ? "GoMoon" : undefined),
    productName: text(product.name) || "Светильник",
    imageUrl: text(product.image) || undefined,
    category: text(product.categoryTrail) || "Технический свет",
    quantity: 1,
    updatedAt: text(project.updated_at) || undefined,
  };
}

export function extractProjectProductUsage(projects: ProjectRow[]) {
  const usages: Usage[] = [];
  for (const project of projects) {
    const state = parseState(project.state_json);
    const byProjectItem = new Map<string, Usage>();
    for (const field of ["planItems", "proposalItems"] as const) {
      const items = Array.isArray(state[field]) ? state[field] : [];
      for (const raw of items) {
        const item = object(raw);
        if (!item) continue;
        const usage = planUsage(project, item);
        if (usage && !byProjectItem.has(usage.projectItemId)) byProjectItem.set(usage.projectItemId, usage);
      }
    }
    const technical = object(state.technicalLighting);
    for (const field of ["tracks", "fixtures"] as const) {
      const items = Array.isArray(technical?.[field]) ? technical[field] : [];
      for (const raw of items) {
        const item = object(raw);
        if (!item) continue;
        const usage = lightingUsage(project, field === "tracks" ? "track" : "fixture", item);
        if (usage && !byProjectItem.has(usage.projectItemId)) byProjectItem.set(usage.projectItemId, usage);
      }
    }
    usages.push(...byProjectItem.values());
  }
  return usages;
}

function brandShares(brands: Array<Omit<BrandUsage, "sharePercent">>): BrandUsage[] {
  const total = brands.reduce((sum, brand) => sum + brand.usageCount, 0);
  if (!total) return brands.map((brand) => ({ ...brand, sharePercent: 0 }));
  const calculated = brands.map((brand) => {
    const exact = brand.usageCount / total * 100;
    return { brand, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = 100 - calculated.reduce((sum, item) => sum + item.floor, 0);
  calculated.sort((left, right) => right.remainder - left.remainder || left.brand.brandId.localeCompare(right.brand.brandId));
  calculated.forEach((item) => { if (remaining > 0) { item.floor += 1; remaining -= 1; } });
  return calculated.map(({ brand, floor }) => ({ ...brand, sharePercent: floor }));
}

export function buildPersonalCatalogDashboard({
  projects,
  furnitureProducts = [],
  lightingProducts = [],
  catalogAvailable = true,
}: {
  projects: ProjectRow[];
  furnitureProducts?: FurnitureCatalogProduct[];
  lightingProducts?: LightingProduct[];
  catalogAvailable?: boolean;
}): PersonalCatalogDashboard {
  const usages = extractProjectProductUsage(projects);
  const furnitureById = new Map<string, FurnitureCatalogProduct>();
  furnitureProducts.forEach((product) => { furnitureById.set(product.id, product); furnitureById.set(`${product.source}:${product.sourceId}`, product); if (product.source === "norrmobler") furnitureById.set(product.sourceId, product); });
  const lightingById = new Map(lightingProducts.map((product) => [product.id, product]));
  const aggregated = new Map<string, DashboardFurnitureItem & { projects: Set<string> }>();

  for (const usage of usages) {
    const furniture = furnitureById.get(usage.productId);
    const lighting = lightingById.get(usage.productId);
    const furnitureBrandName = usage.savedBrandName || (furniture?.brand ? furnitureBrandForDisplay(furniture.brand) : undefined);
    const brandId = (furnitureBrandName ? normalizedBrandId(furnitureBrandName) : usage.savedBrandId) || lighting?.provider;
    const brandName = furnitureBrandName || lighting?.brand;
    const identityKey = brandId ? `${brandId}:${usage.productId}` : `product:${usage.productId}`;
    const current = aggregated.get(identityKey) || {
      identityKey,
      productId: usage.productId,
      sku: usage.sku,
      brandId,
      brandName,
      productName: usage.productName,
      imageUrl: usage.imageUrl,
      category: usage.category,
      variantLabel: usage.variantLabel,
      uniqueProjectCount: 0,
      usageCount: 0,
      lastUsedAt: usage.updatedAt,
      available: furniture?.available ?? lighting?.available,
      projects: new Set<string>(),
    };
    current.brandId ||= brandId;
    current.brandName ||= brandName;
    current.productName = furniture?.name || lighting?.name || usage.productName || current.productName;
    current.imageUrl = furniture?.image || lighting?.image || current.imageUrl;
    current.category = furniture?.category || lighting?.category || current.category;
    current.sku ||= furniture?.article || lighting?.article;
    current.variantLabel ||= usage.variantLabel;
    if (furniture || lighting) current.available = furniture?.available ?? lighting?.available;
    current.projects.add(usage.projectId);
    current.usageCount += usage.quantity;
    if ((usage.updatedAt || "") > (current.lastUsedAt || "")) current.lastUsedAt = usage.updatedAt;
    aggregated.set(identityKey, current);
  }

  const projectIdsByIdentity = new Map(Array.from(aggregated.entries()).map(([identityKey, product]) => [identityKey, product.projects]));
  const products = Array.from(aggregated.values()).map(({ projects: usedInProjects, ...product }) => ({ ...product, uniqueProjectCount: usedInProjects.size }));
  products.sort((left, right) => right.uniqueProjectCount - left.uniqueProjectCount || right.usageCount - left.usageCount || (right.lastUsedAt || "").localeCompare(left.lastUsedAt || "") || left.identityKey.localeCompare(right.identityKey));
  const groupedBrands = new Map<string, { brandId: string; brandName: string; products: Set<string>; projects: Set<string>; usageCount: number }>();
  for (const product of products) {
    if (!product.brandId || !product.brandName) continue;
    const group = groupedBrands.get(product.brandId) || { brandId: product.brandId, brandName: product.brandName, products: new Set<string>(), projects: new Set<string>(), usageCount: 0 };
    group.products.add(product.identityKey);
    projectIdsByIdentity.get(product.identityKey)?.forEach((projectId) => group.projects.add(projectId));
    group.usageCount += product.usageCount;
    groupedBrands.set(product.brandId, group);
  }
  const brands = brandShares(Array.from(groupedBrands.values()).map((brand) => ({ brandId: brand.brandId, brandName: brand.brandName, uniqueProductCount: brand.products.size, projectCount: brand.projects.size, usageCount: brand.usageCount })))
    .sort((left, right) => right.usageCount - left.usageCount || left.brandName.localeCompare(right.brandName, "ru"));

  return {
    projectsCount: projects.length,
    uniqueProductsCount: products.length,
    favoritesCount: 0,
    usedBrandsCount: brands.length,
    topProducts: products.slice(0, 3),
    brands,
    furnitureState: products.length ? "ready" : usages.length && !catalogAvailable ? "unavailable" : "empty",
  };
}
