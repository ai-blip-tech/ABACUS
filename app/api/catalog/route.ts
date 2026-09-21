type Category = { id: string; parentId: string; name: string };

type CatalogProduct = {
  id: string;
  name: string;
  article: string;
  image: string;
  images: string[];
  url: string;
  price: number;
  oldPrice: number;
  available: boolean;
  category: string;
  subtype: string;
  color: string;
  material: string;
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  description: string;
  parameters: Array<{ name: string; value: string }>;
  _trail?: string;
};

type CatalogCache = { expiresAt: number; products: CatalogProduct[] };

const FEED_URL = "https://norrmobler.ru/yml.php";
const CACHE_TTL = 30 * 60 * 1000;
let catalogCache: CatalogCache | null = null;

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

const tag = (source: string, name: string) => {
  const match = source.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1] || "");
};

const allTags = (source: string, name: string) => Array.from(
  source.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi")),
  (match) => decodeXml(match[1] || ""),
).filter(Boolean);

const primaryProductImage = (images: string[]) => images.find((image) => /\/main\/(?:0*1)(?:\.[a-z0-9]+)?(?:\?|$)/i.test(image))
  || images.find((image) => /\/main\//i.test(image))
  || images[0]
  || "";

const normalize = (value = "") => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const centimetersToMillimeters = (value?: string) => {
  const number = Number(String(value || "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 10) : null;
};

const matchesCatalogType = (product: CatalogProduct, type: string, categoryTrail: string) => {
  const text = normalize(`${product.name} ${product.subtype} ${product.category} ${categoryTrail}`);
  const categoryText = normalize(`${product.category} ${categoryTrail}`);
  if (type === "sofa") return /диван|модул|кушет/.test(text);
  if (type === "armchair") return /кресл/.test(text);
  if (type === "chair") return /стул/.test(text);
  if (type === "dining_table") return /обеденн/.test(text);
  if (type === "coffee_table") return /журнальн|приставн/.test(text);
  if (type === "desk_table") return /письменн|туалетн/.test(text);
  if (type === "table") return /стол/.test(text) && !/стул|консол/.test(text);
  if (type === "bed") return /кроват/.test(text) && !/прикроват/.test(text);
  if (type === "dresser") return /комод/.test(text);
  if (type === "tv_stand") return /(?:тв|tv|телевиз)[\s-]*(?:тумб|стойк)|тумб[^/]{0,45}(?:тв|tv|телевиз)/.test(text);
  if (type === "rug") return /ковер|ковры|шкура/.test(categoryText);
  if (type === "light") return /свет|люстр|торшер|ламп/.test(text);
  if (type === "decor") return /зеркал|аксессуар(?:ы)? для дома|статуэт|ваз|подуш/.test(categoryText);
  return false;
};

async function loadCatalog() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.products;
  const response = await fetch(FEED_URL, { headers: { Accept: "application/xml,text/xml" } });
  if (!response.ok) throw new Error(`Feed responded with ${response.status}`);
  const xml = await response.text();

  const categories = new Map<string, Category>();
  for (const match of xml.matchAll(/<category\s+id="([^"]+)"(?:\s+parentId="([^"]+)")?>([\s\S]*?)<\/category>/gi)) {
    categories.set(match[1], { id: match[1], parentId: match[2] || "", name: decodeXml(match[3]) });
  }
  const categoryTrail = (id: string) => {
    const names: string[] = [];
    const visited = new Set<string>();
    let current = categories.get(id);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.push(current.name);
      current = categories.get(current.parentId);
    }
    return names.join(" / ");
  };

  const products: CatalogProduct[] = [];
  for (const match of xml.matchAll(/<offer\s+id="([^"]+)"\s+available="([^"]+)"[^>]*>([\s\S]*?)<\/offer>/gi)) {
    const body = match[3];
    const params: Record<string, string> = {};
    for (const param of body.matchAll(/<param\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/param>/gi)) {
      const key = decodeXml(param[1]);
      const value = decodeXml(param[2]);
      if (key && value && !params[key]) params[key] = value;
    }
    const categoryId = tag(body, "categoryId");
    const images = allTags(body, "picture");
    const name = tag(body, "name");
    const image = primaryProductImage(images);
    if (!name || !image) continue;
    products.push({
      id: match[1],
      name,
      article: params["Артикул"] || tag(body, "barcode") || match[1],
      image,
      images,
      url: tag(body, "url"),
      price: Number(tag(body, "price")) || 0,
      oldPrice: Number(tag(body, "oldprice")) || 0,
      available: match[2] === "true",
      category: categories.get(categoryId)?.name || "Каталог",
      subtype: params["Тип"] || categories.get(categoryId)?.name || "",
      color: params["Цвет"] || params["Цвет корпуса"] || params["Ткань Цвет"] || params["Цвет столешницы"] || "",
      material: params["Материал"] || params["Материал обивки"] || params["Материал корпуса"] || params["Материал столешницы"] || "",
      widthMm: centimetersToMillimeters(params["Габаритная ширина"]),
      depthMm: centimetersToMillimeters(params["Габаритная глубина"]),
      heightMm: centimetersToMillimeters(params["Габаритная высота"]),
      description: tag(body, "description"),
      parameters: Object.entries(params).map(([name, value]) => ({ name, value })),
      _trail: categoryTrail(categoryId),
    });
  }
  catalogCache = { expiresAt: Date.now() + CACHE_TTL, products };
  return products;
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const ids = new Set((search.get("ids") || "").split(",").map((id) => id.trim()).filter(Boolean));
  const type = search.get("type") || "sofa";
  const query = normalize(search.get("q") || "");
  const subtype = normalize(search.get("subtype") || "");
  const availableOnly = search.get("available") === "1";
  const page = Math.max(1, Number(search.get("page")) || 1);
  const limit = Math.min(30, Math.max(6, Number(search.get("limit")) || 18));

  try {
    const products = await loadCatalog();
    const matched = products.filter((product) => {
      if (ids.size) return ids.has(product.id);
      const trail = product._trail || "";
      if (!matchesCatalogType(product, type, trail)) return false;
      if (availableOnly && !product.available) return false;
      const haystack = normalize(`${product.name} ${product.article} ${product.subtype} ${product.color} ${product.material}`);
      if (query && !haystack.includes(query)) return false;
      return !subtype || normalize(product.subtype).includes(subtype);
    });
    const subtypes = Array.from(new Set(matched.map((product) => product.subtype).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru")).slice(0, 24);
    const start = (page - 1) * limit;
    const selectedProducts = ids.size ? matched.slice(0, 100) : matched.slice(start, start + limit);
    const pageProducts = selectedProducts.map((product) => ({
      id: product.id,
      name: product.name,
      article: product.article,
      image: product.image,
      images: product.images,
      url: product.url,
      price: product.price,
      oldPrice: product.oldPrice,
      available: product.available,
      category: product.category,
      subtype: product.subtype,
      color: product.color,
      material: product.material,
      widthMm: product.widthMm,
      depthMm: product.depthMm,
      heightMm: product.heightMm,
      description: product.description,
      parameters: product.parameters,
    }));
    return Response.json({ products: pageProducts, total: matched.length, page, limit, subtypes });
  } catch {
    return Response.json({ error: "Каталог временно недоступен. Попробуйте ещё раз." }, { status: 502 });
  }
}
