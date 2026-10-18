export type LightingProductType = "track" | "track_fixture" | "fixture" | "power" | "accessory";

export type LightingProduct = {
  id: string;
  provider: "gomoon";
  brand: "GoMoon";
  offerId: string;
  article: string;
  name: string;
  description: string;
  image: string;
  images: string[];
  url: string;
  price: number;
  currency: string;
  available: boolean;
  categoryId: string;
  category: string;
  categoryTrail: string;
  type: LightingProductType;
  specs: {
    powerW: number | null;
    voltageV: number | null;
    cctK: number | null;
    beamDeg: number | null;
    lengthMm: number | null;
  };
};

const LIGHTING_FEED_URL = "https://gomoon.ru/bitrix/catalog_export/yandex_801943.php";
const LIGHTING_CACHE_TTL = 30 * 60 * 1000;
let lightingCache: { expiresAt: number; products: LightingProduct[] } | null = null;

type Category = { id: string; parentId: string; name: string };

const decodeXml = (value = "") => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&nbsp;|&#160;/g, " ")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const tag = (source: string, name: string) => decodeXml(
  source.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "",
);

const allTags = (source: string, name: string) => Array.from(
  source.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi")),
  (match) => decodeXml(match[1] || ""),
).filter(Boolean);

const secureGomoonUrl = (value: string) => value.replace(/^http:\/\/(?:www\.)?gomoon\.ru/i, "https://gomoon.ru");
const numberFrom = (value: string, expression: RegExp) => {
  const match = value.match(expression);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

function productType(value: string): LightingProductType {
  const normalized = value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  if (/источник(?:и)? питания|блок(?:и)? питания|драйвер/.test(normalized)) return "power";
  if (/аксессуар|комплектующ/.test(normalized)) return "accessory";
  if (/треков(?:ый|ые|ого|ых)\s+(?:светильник|прожектор)|(?:светильник|прожектор)\s+для\s+трека/.test(normalized)) return "track_fixture";
  if (/треки/.test(normalized)) return "track";
  return "fixture";
}

export function parseLightingCatalog(xml: string): LightingProduct[] {
  const categories = new Map<string, Category>();
  for (const match of xml.matchAll(/<category\s+id="([^"]+)"(?:\s+parentId="([^"]+)")?>([\s\S]*?)<\/category>/gi)) {
    categories.set(match[1], { id: match[1], parentId: match[2] || "", name: decodeXml(match[3]) });
  }
  const categoryTrail = (categoryId: string) => {
    const names: string[] = [];
    const visited = new Set<string>();
    let category = categories.get(categoryId);
    while (category && !visited.has(category.id)) {
      visited.add(category.id);
      names.unshift(category.name);
      category = categories.get(category.parentId);
    }
    return names.join(" / ");
  };

  const products: LightingProduct[] = [];
  for (const match of xml.matchAll(/<offer\s+id="([^"]+)"\s+available="([^"]+)"[^>]*>([\s\S]*?)<\/offer>/gi)) {
    const offerId = match[1];
    const body = match[3];
    const name = tag(body, "name");
    const categoryId = tag(body, "categoryId");
    if (!name || !categoryId) continue;
    const trail = categoryTrail(categoryId);
    const images = allTags(body, "picture").map(secureGomoonUrl);
    if (images.length === 0) continue;
    const description = tag(body, "description");
    const sourceText = `${name} ${description}`;
    const nameLengthMetres = numberFrom(name, /(?:^|\s)(\d+(?:[.,]\d+)?)\s*м(?:\s|$)/i);
    const nameLengthMillimetres = numberFrom(name, /(\d+(?:[.,]\d+)?)\s*мм/i);
    const descriptionLengthMetres = numberFrom(description, /(?:^|\s)(\d+(?:[.,]\d+)?)\s*м(?:\s|$)/i);
    const descriptionLengthMillimetres = numberFrom(description, /(\d+(?:[.,]\d+)?)\s*мм/i);
    const lengthMm = nameLengthMillimetres
      ?? (nameLengthMetres === null ? null : Math.round(nameLengthMetres * 1000))
      ?? descriptionLengthMillimetres
      ?? (descriptionLengthMetres === null ? null : Math.round(descriptionLengthMetres * 1000));
    products.push({
      id: `gomoon:${offerId}`,
      provider: "gomoon",
      brand: "GoMoon",
      offerId,
      article: tag(body, "vendorCode") || offerId,
      name,
      description,
      image: images[0] || "",
      images,
      url: secureGomoonUrl(tag(body, "url")),
      price: Number(tag(body, "price")) || 0,
      currency: tag(body, "currencyId") || "RUB",
      available: match[2] === "true",
      categoryId,
      category: categories.get(categoryId)?.name || "Технический свет",
      categoryTrail: trail,
      type: productType(`${trail} ${name}`),
      specs: {
        powerW: numberFrom(sourceText, /(\d+(?:[.,]\d+)?)\s*Вт/i),
        voltageV: numberFrom(sourceText, /(\d+(?:[.,]\d+)?)\s*В(?:\s|,|$)/i),
        cctK: numberFrom(sourceText, /(\d{4})\s*К/i),
        beamDeg: numberFrom(sourceText, /(?:угол\s*)?(\d+(?:[.,]\d+)?)\s*°/i),
        lengthMm,
      },
    });
  }
  return products;
}

export async function loadLightingCatalog() {
  if (lightingCache && lightingCache.expiresAt > Date.now()) return lightingCache.products;
  const response = await fetch(LIGHTING_FEED_URL, { headers: { Accept: "application/xml,text/xml", "User-Agent": "ROOM-design-lighting/1.0" }, cache: "no-store" });
  if (!response.ok) throw new Error(`GoMoon feed responded with ${response.status}`);
  const products = parseLightingCatalog(await response.text());
  lightingCache = { expiresAt: Date.now() + LIGHTING_CACHE_TTL, products };
  return products;
}

