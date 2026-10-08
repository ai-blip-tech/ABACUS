export type ProposalDocument = {
  clientName: string; projectName: string; offerNumber: string; offerDate: string; validUntil: string;
  selectionCount: string; categories: string; principle: string; cityObject: string; summaryNote: string;
  leadTime: string; delivery: string; payment: string; managerRole: string; managerPhone: string; managerEmail: string;
};

export type ProposalOverride = {
  name?: string; width?: number; depth?: number; height?: number; price?: number; quantity?: number;
  article?: string; category?: string; brand?: string; configuration?: string; option?: string;
  characteristics?: string[]; notes?: string;
};

export type ProposalPlanItem = {
  id: string; kind?: string; name: string; width: number; depth: number;
  referenceImage?: string; referenceImages?: string[]; referenceName?: string;
  referenceProductId?: string; referenceArticle?: string; referenceUrl?: string;
  referencePrice?: number; referenceOldPrice?: number; referenceCategory?: string;
  referenceSubtype?: string; referenceColor?: string; referenceMaterial?: string;
  referenceHeightMm?: number | null; referenceDescription?: string;
  referenceParameters?: Array<{ name: string; value: string }>; proposalOverride?: ProposalOverride;
};

type ProposalSelectionState = {
  planItems?: ProposalPlanItem[];
  proposalItems?: ProposalPlanItem[];
  proposalHistoryId?: string | null;
  historyVersions?: Array<{ id?: string; proposalItems?: ProposalPlanItem[] }>;
};

export function proposalItemsForSelection(state?: ProposalSelectionState) {
  if (!state) return [];
  if (state.proposalHistoryId) {
    const selectedVersion = (state.historyVersions || []).find((version) => version.id === state.proposalHistoryId);
    return selectedVersion?.proposalItems || [];
  }
  return [...new Map([
    ...(state.planItems || []),
    ...(state.proposalItems || []),
  ].map((item) => [item.id, item])).values()];
}

export type ProposalCatalogProduct = {
  id: string; name: string; article?: string; image?: string; images?: string[]; url?: string;
  price?: number; oldPrice?: number; category?: string; subtype?: string; color?: string; material?: string;
  widthMm?: number | null; depthMm?: number | null; heightMm?: number | null;
  description?: string; parameters?: Array<{ name: string; value: string }>;
};

export type ProposalProduct = {
  key: string; source: "catalog" | "reference"; objectIds: string[]; quantity: number;
  name: string; image: string; images: string[]; article: string; url: string;
  width?: number; depth?: number; height?: number; price?: number; oldPrice?: number;
  notes: string; category: string; brand: string; configuration: string; option: string;
  characteristics: string[]; subtype: string; color: string; material: string; description: string;
  parameters: Array<{ name: string; value: string }>;
};

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const shortDate = (value: Date) => new Intl.DateTimeFormat("ru-RU").format(value);

export function defaultProposalDocument(projectName: string, productCount = 0): ProposalDocument {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 14);
  return {
    clientName: "Для частного интерьера", projectName: projectName || "Персональная подборка",
    offerNumber: `№ ${String(now.getFullYear()).slice(-2)}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    offerDate: shortDate(now), validUntil: shortDate(expiry),
    selectionCount: `${productCount} ${productCount === 1 ? "предмет" : productCount > 1 && productCount < 5 ? "предмета" : "предметов"}`,
    categories: "Мебель, свет и фактуры",
    principle: "Спокойная основа, архитектурный свет и один выразительный акцент.",
    cityObject: "Москва / частный интерьер",
    summaryNote: "Стоимость позиций по запросу будет добавлена после подтверждения конфигурации и ткани.",
    leadTime: "Уточняется после подтверждения конфигураций",
    delivery: "Индивидуальный расчёт; сборка согласуется с менеджером",
    payment: "По счёту, согласно условиям договора",
    managerRole: "Персональный менеджер", managerPhone: "", managerEmail: "",
  };
}

export function mergeProposalDocument(value: unknown, defaults: ProposalDocument): ProposalDocument {
  if (!value || typeof value !== "object") return defaults;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
    key, typeof source[key] === "string" ? source[key] : fallback,
  ])) as ProposalDocument;
}

export function buildProposalProducts(items: ProposalPlanItem[], catalog: Map<string, ProposalCatalogProduct> = new Map()): ProposalProduct[] {
  const eligible = items.filter((item) => item.referenceImage && item.kind !== "window" && item.kind !== "door");
  const groups = new Map<string, ProposalPlanItem[]>();
  for (const item of eligible) {
    const key = item.referenceProductId ? `catalog:${item.referenceProductId}` : `reference:${item.id}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const item = group[0];
    const product = item.referenceProductId ? catalog.get(item.referenceProductId) : undefined;
    const override = item.proposalOverride || {};
    const image = product?.image || item.referenceImage || "";
    const parameters = product?.parameters || item.referenceParameters || [];
    const productIdentity = `${product?.category || item.referenceCategory || ""} ${product?.name || item.referenceName || item.name || ""}`;
    const defaultBrand = /свет|ламп|торшер/i.test(productIdentity)
      ? "SEYVAA PARIS"
      : /ковр|фактур|шкур/i.test(productIdentity) ? "NORR CARPETS" : "NORR MÖBLER SELECTION";
    const defaults = parameters.filter(({ name }) => !/артикул|габарит|цвет|материал|тип/i.test(name))
      .slice(0, 4).map(({ name, value }) => `${name}: ${value}`);
    return {
      key, source: item.referenceProductId ? "catalog" : "reference", objectIds: group.map((entry) => entry.id),
      quantity: finite(override.quantity) ?? group.length,
      name: override.name || product?.name || item.referenceName || item.name || "Предмет интерьера",
      image, images: product?.images || item.referenceImages || (image ? [image] : []),
      article: override.article ?? product?.article ?? item.referenceArticle ?? "", url: product?.url || item.referenceUrl || "",
      width: finite(override.width) ?? finite(product?.widthMm) ?? finite(item.width),
      depth: finite(override.depth) ?? finite(product?.depthMm) ?? finite(item.depth),
      height: finite(override.height) ?? finite(product?.heightMm) ?? finite(item.referenceHeightMm),
      price: finite(override.price) ?? finite(product?.price) ?? finite(item.referencePrice),
      oldPrice: finite(product?.oldPrice) ?? finite(item.referenceOldPrice),
      notes: override.notes ?? "Финальная стоимость зависит от ткани, отделки и выбранной конфигурации.",
      category: override.category ?? product?.category ?? item.referenceCategory ?? "Предмет интерьера",
      brand: override.brand && !(override.brand === "NORR MÖBLER SELECTION" && defaultBrand !== "NORR MÖBLER SELECTION")
        ? override.brand : defaultBrand,
      configuration: override.configuration ?? "Выбранная конфигурация",
      option: override.option ?? product?.material ?? item.referenceMaterial ?? "Подтверждается по образцу",
      characteristics: [...(override.characteristics ?? defaults), "", "", "", ""].slice(0, 4),
      subtype: product?.subtype || item.referenceSubtype || "", color: product?.color || item.referenceColor || "",
      material: product?.material || item.referenceMaterial || "", description: product?.description || item.referenceDescription || "", parameters,
    };
  });
}

export const proposalTotal = (products: ProposalProduct[]) => products.reduce(
  (total, product) => total + (product.price || 0) * product.quantity, 0,
);

export const proposalOverrideFor = (product: ProposalProduct): ProposalOverride => ({
  name: product.name, width: product.width, depth: product.depth, height: product.height, price: product.price,
  quantity: product.quantity, article: product.article, category: product.category, brand: product.brand,
  configuration: product.configuration, option: product.option, characteristics: product.characteristics, notes: product.notes,
});

export function paginateProposalSpecification<T>(items: T[], detailCapacity = 9, finalCapacity = 5): T[][] {
  if (items.length <= finalCapacity) return [items];
  const pages: T[][] = [];
  let offset = 0;
  while (items.length - offset > finalCapacity) {
    const count = Math.min(detailCapacity, items.length - offset - finalCapacity);
    pages.push(items.slice(offset, offset + count));
    offset += count;
  }
  pages.push(items.slice(offset));
  return pages;
}
