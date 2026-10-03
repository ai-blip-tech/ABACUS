export type ProposalOverride = {
  name?: string;
  width?: number;
  depth?: number;
  height?: number;
  price?: number;
  notes?: string;
};

export type ProposalPlanItem = {
  id: string;
  kind?: string;
  name: string;
  width: number;
  depth: number;
  referenceImage?: string;
  referenceImages?: string[];
  referenceName?: string;
  referenceProductId?: string;
  referenceArticle?: string;
  referenceUrl?: string;
  referencePrice?: number;
  referenceOldPrice?: number;
  referenceCategory?: string;
  referenceSubtype?: string;
  referenceColor?: string;
  referenceMaterial?: string;
  referenceHeightMm?: number | null;
  referenceDescription?: string;
  referenceParameters?: Array<{ name: string; value: string }>;
  proposalOverride?: ProposalOverride;
};

export type ProposalCatalogProduct = {
  id: string;
  name: string;
  article?: string;
  image?: string;
  images?: string[];
  url?: string;
  price?: number;
  oldPrice?: number;
  category?: string;
  subtype?: string;
  color?: string;
  material?: string;
  widthMm?: number | null;
  depthMm?: number | null;
  heightMm?: number | null;
  description?: string;
  parameters?: Array<{ name: string; value: string }>;
};

export type ProposalProduct = {
  key: string;
  source: "catalog" | "reference";
  objectIds: string[];
  quantity: number;
  name: string;
  image: string;
  images: string[];
  article: string;
  url: string;
  width?: number;
  depth?: number;
  height?: number;
  price?: number;
  oldPrice?: number;
  notes: string;
  category: string;
  subtype: string;
  color: string;
  material: string;
  description: string;
  parameters: Array<{ name: string; value: string }>;
};

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function buildProposalProducts(
  items: ProposalPlanItem[],
  catalog: Map<string, ProposalCatalogProduct> = new Map(),
): ProposalProduct[] {
  const eligible = items.filter((item) => item.referenceImage && item.kind !== "window" && item.kind !== "door");
  const groups = new Map<string, ProposalPlanItem[]>();
  for (const item of eligible) {
    const key = item.referenceProductId ? `catalog:${item.referenceProductId}` : `reference:${item.id}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const item = group[0];
    const source = item.referenceProductId ? "catalog" as const : "reference" as const;
    const product = item.referenceProductId ? catalog.get(item.referenceProductId) : undefined;
    const override = item.proposalOverride || {};
    const image = product?.image || item.referenceImage || "";
    return {
      key,
      source,
      objectIds: group.map((entry) => entry.id),
      quantity: group.length,
      name: override.name || product?.name || item.referenceName || item.name || "Предмет интерьера",
      image,
      images: product?.images || item.referenceImages || (image ? [image] : []),
      article: product?.article || item.referenceArticle || "",
      url: product?.url || item.referenceUrl || "",
      width: finite(override.width) ?? finite(product?.widthMm) ?? finite(item.width),
      depth: finite(override.depth) ?? finite(product?.depthMm) ?? finite(item.depth),
      height: finite(override.height) ?? finite(product?.heightMm) ?? finite(item.referenceHeightMm),
      price: finite(override.price) ?? finite(product?.price) ?? finite(item.referencePrice),
      oldPrice: finite(product?.oldPrice) ?? finite(item.referenceOldPrice),
      notes: override.notes || "",
      category: product?.category || item.referenceCategory || "",
      subtype: product?.subtype || item.referenceSubtype || "",
      color: product?.color || item.referenceColor || "",
      material: product?.material || item.referenceMaterial || "",
      description: product?.description || item.referenceDescription || "",
      parameters: product?.parameters || item.referenceParameters || [],
    };
  });
}

export const proposalTotal = (products: ProposalProduct[]) => products.reduce(
  (total, product) => total + (product.price || 0) * product.quantity,
  0,
);

export const proposalOverrideFor = (product: ProposalProduct): ProposalOverride => ({
  name: product.name,
  width: product.width,
  depth: product.depth,
  height: product.height,
  price: product.price,
  notes: product.notes,
});
