export type FurnitureCatalogSource = "norrmobler" | "leve-home";

type Category = { id: string; parentId: string; name: string };

export type FurnitureCatalogProduct = {
  id: string; sourceId: string; source: FurnitureCatalogSource; name: string; article: string;
  image: string; images: string[]; url: string; price: number; oldPrice: number; available: boolean;
  category: string; subtype: string; color: string; material: string; brand: string;
  widthMm: number | null; depthMm: number | null; heightMm: number | null; description: string;
  parameters: Array<{ name: string; value: string }>; _trail?: string; _updatedAt?: string;
};

export const FURNITURE_CATALOG_SOURCES = [
  { id: "norrmobler" as const, name: "NORR Møbler", feedUrl: "https://norrmobler.ru/yml.php" },
  { id: "leve-home" as const, name: "LEVE HOME", feedUrl: "https://rom-divan.ru/xml/leve.xml" },
];

export const NORR_ALLOWED_PRODUCT_BRANDS = ["NORR Mobler", "ROM", "NORR Carpets", "FUGA", "SEYVAA PARIS", "MOBLIBERICA"] as const;
const normalizeBrand = (value: string) => value.toLocaleUpperCase("ru-RU").replace(/Ё/g, "Е").replace(/[^A-ZА-Я0-9]+/g, " ").trim();
const norrAllowedBrandByKey = new Map(NORR_ALLOWED_PRODUCT_BRANDS.map((brand) => [normalizeBrand(brand), brand]));
export const furnitureBrandForDisplay = (value: string) => {
  const key = normalizeBrand(value);
  return key === "ROM" || key === "NORR MOBLER" ? "NORR Møbler" : value.trim();
};

type SourceCache = { expiresAt: number; products: FurnitureCatalogProduct[] };
const CATALOG_CACHE_TTL = 30 * 60 * 1000;
const catalogCaches = new Map<FurnitureCatalogSource, SourceCache>();

export const decodeCatalogXml = (value = "") => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&nbsp;|&#160;/g, " ")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const tag = (source: string, name: string) => decodeCatalogXml(source.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
const allTags = (source: string, name: string) => Array.from(source.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi")), (match) => decodeCatalogXml(match[1] || "")).filter(Boolean);
const attribute = (source: string, name: string) => decodeCatalogXml(source.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, "i"))?.[1] || "");
const primaryProductImage = (images: string[]) => images.find((image) => /\/main\/(?:0*1)(?:\.[a-z0-9]+)?(?:\?|$)/i.test(image)) || images.find((image) => /\/main\//i.test(image)) || images[0] || "";
const centimetersToMillimeters = (value?: string) => { const number = Number(String(value || "").replace(",", ".").replace(/[^\d.]/g, "")); return Number.isFinite(number) && number > 0 ? Math.round(number * 10) : null; };
const dimensionFromSlashValue = (value: string, index: number) => centimetersToMillimeters(value.split("/")[index]);

export function parseFurnitureCatalog(xml: string, source: FurnitureCatalogSource): FurnitureCatalogProduct[] {
  const sourceConfig = FURNITURE_CATALOG_SOURCES.find((item) => item.id === source)!;
  const categories = new Map<string, Category>();
  for (const match of xml.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/gi)) {
    const id = attribute(match[1], "id"); if (!id) continue;
    categories.set(id, { id, parentId: attribute(match[1], "parentId"), name: decodeCatalogXml(match[2]) });
  }
  const categoryTrail = (id: string) => { const names: string[] = []; const visited = new Set<string>(); let current = categories.get(id); while (current && !visited.has(current.id)) { visited.add(current.id); names.push(current.name); current = categories.get(current.parentId); } return names.join(" / "); };
  const products: FurnitureCatalogProduct[] = []; const updatedAt = new Date().toISOString();
  for (const match of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/gi)) {
    const attributes = match[1]; const body = match[2]; const sourceId = attribute(attributes, "id"); if (!sourceId) continue;
    const feedAvailable = attribute(attributes, "available").toLowerCase() !== "false";
    const stockValue = tag(body, "stock"); const stock = stockValue === "" ? null : Number(stockValue.replace(",", "."));
    const available = feedAvailable && (source !== "leve-home" || (Number.isFinite(stock) && Number(stock) > 0));
    if (source === "leve-home" && !available) continue;
    const params: Record<string, string> = {};
    for (const param of body.matchAll(/<param\b([^>]*)>([\s\S]*?)<\/param>/gi)) { const key = attribute(param[1], "name"); const value = decodeCatalogXml(param[2]); if (key && value && !params[key]) params[key] = value; }
    const sourceBrand = source === "norrmobler"
      ? norrAllowedBrandByKey.get(normalizeBrand(params["Бренд"] || params["Производитель"] || ""))
      : sourceConfig.name;
    if (!sourceBrand) continue;
    const brand = furnitureBrandForDisplay(sourceBrand);
    const categoryId = tag(body, "categoryId"); const images = allTags(body, "picture"); const name = tag(body, "name"); const image = primaryProductImage(images); if (!name || !image) continue;
    const dimensions = tag(body, "dimensions"); const rawType = tag(body, "Тип") || params["Тип"];
    products.push({
      id: source === "norrmobler" ? sourceId : `${source}:${sourceId}`, sourceId, source, name,
      article: params["Артикул"] || tag(body, "vendorCode") || tag(body, "barcode") || sourceId,
      image, images, url: tag(body, "url"), price: Number(tag(body, "price")) || 0, oldPrice: Number(tag(body, "oldprice")) || 0, available,
      category: categories.get(categoryId)?.name || "Каталог", subtype: rawType || categories.get(categoryId)?.name || "",
      color: params["Цвет"] || params["Цвет корпуса"] || params["Ткань Цвет"] || params["Цвет столешницы"] || "",
      material: params["Материал"] || params["Материал обивки"] || params["Материал корпуса"] || params["Материал столешницы"] || "",
      brand,
      widthMm: centimetersToMillimeters(params["Габаритная ширина"]) || dimensionFromSlashValue(dimensions, 0),
      depthMm: centimetersToMillimeters(params["Габаритная глубина"]) || dimensionFromSlashValue(dimensions, 1),
      heightMm: centimetersToMillimeters(params["Габаритная высота"]) || dimensionFromSlashValue(dimensions, 2),
      description: tag(body, "description"), parameters: Object.entries(params).map(([paramName, value]) => ({ name: paramName, value })), _trail: categoryTrail(categoryId), _updatedAt: updatedAt,
    });
  }
  return products;
}

async function loadFurnitureSource(source: (typeof FURNITURE_CATALOG_SOURCES)[number]) {
  const cached = catalogCaches.get(source.id);
  if (cached && cached.expiresAt > Date.now()) return cached.products;
  const response = await fetch(source.feedUrl, { headers: { Accept: "application/xml,text/xml" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${source.name} feed responded with ${response.status}`);
  const products = parseFurnitureCatalog(await response.text(), source.id);
  catalogCaches.set(source.id, { expiresAt: Date.now() + CATALOG_CACHE_TTL, products });
  return products;
}

export async function loadFurnitureCatalog() {
  const results = await Promise.allSettled(FURNITURE_CATALOG_SOURCES.map(loadFurnitureSource));
  const products = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!products.length) throw new Error("No furniture feeds are available");
  const unavailableSources = results.flatMap((result, index) => result.status === "rejected" ? [FURNITURE_CATALOG_SOURCES[index].id] : []);
  return { products, unavailableSources };
}
