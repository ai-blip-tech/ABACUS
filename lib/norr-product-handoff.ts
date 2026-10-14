export const NORR_PRODUCT_QUERY_PARAMETER = "norrProduct";
export const NORR_PRODUCT_STORAGE_KEY = "roomdesign:norr-product-handoff:v1";
export const NORR_PRODUCT_HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

const PRODUCT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type StoredNorrProductHandoff = { productId: string; savedAt: number };

export function validNorrProductId(value: string | null | undefined) {
  const productId = value?.trim() || "";
  return PRODUCT_ID_PATTERN.test(productId) ? productId : "";
}

export function norrProductIdFromSearch(search: string) {
  return validNorrProductId(new URLSearchParams(search).get(NORR_PRODUCT_QUERY_PARAMETER));
}

export function serializeNorrProductHandoff(productId: string, savedAt = Date.now()) {
  const validProductId = validNorrProductId(productId);
  return validProductId ? JSON.stringify({ productId: validProductId, savedAt } satisfies StoredNorrProductHandoff) : "";
}

export function norrProductIdFromStorage(value: string | null, now = Date.now()) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as Partial<StoredNorrProductHandoff>;
    const productId = validNorrProductId(parsed.productId);
    const savedAt = Number(parsed.savedAt);
    return productId && Number.isFinite(savedAt) && savedAt <= now && now - savedAt <= NORR_PRODUCT_HANDOFF_TTL_MS ? productId : "";
  } catch {
    return "";
  }
}
