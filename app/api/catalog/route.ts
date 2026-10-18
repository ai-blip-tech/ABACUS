import { matchesCatalogType } from "@/lib/catalog-filter";
import { FURNITURE_CATALOG_SOURCES, loadFurnitureCatalog } from "@/lib/furniture-catalog";
const normalize = (value = "") => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const ids = new Set((search.get("ids") || "").split(",").map((id) => id.trim()).filter(Boolean));
  const type = search.get("type") || "sofa";
  const query = normalize(search.get("q") || "");
  const subtype = normalize(search.get("subtype") || "");
  const selectedSources = new Set((search.get("brands") || search.get("brand") || "").split(",").map(normalize).filter(Boolean));
  const availableOnly = search.get("available") === "1";
  const minPrice = Math.max(0, Number(search.get("minPrice")) || 0);
  const maxPrice = Math.max(0, Number(search.get("maxPrice")) || 0);
  const color = normalize(search.get("color") || "");
  const material = normalize(search.get("material") || "");
  const widthMinMm = Math.max(0, Number(search.get("widthMinMm")) || 0);
  const widthMaxMm = Math.max(0, Number(search.get("widthMaxMm")) || 0);
  const depthMinMm = Math.max(0, Number(search.get("depthMinMm")) || 0);
  const depthMaxMm = Math.max(0, Number(search.get("depthMaxMm")) || 0);
  const heightMinMm = Math.max(0, Number(search.get("heightMinMm")) || 0);
  const heightMaxMm = Math.max(0, Number(search.get("heightMaxMm")) || 0);
  const sort = search.get("sort") || "";
  const page = Math.max(1, Number(search.get("page")) || 1);
  const limit = Math.min(30, Math.max(6, Number(search.get("limit")) || 18));

  try {
    const { products, unavailableSources } = await loadFurnitureCatalog();
    const matched = products.filter((product) => {
      if (ids.size) return ids.has(product.id) || (product.source === "norrmobler" && ids.has(product.sourceId));
      if (selectedSources.size && !selectedSources.has(normalize(product.source)) && !selectedSources.has(normalize(product.brand))) return false;
      if (!matchesCatalogType(product, type, product._trail || "")) return false;
      if (availableOnly && !product.available) return false;
      if (minPrice && (!product.price || product.price < minPrice)) return false;
      if (maxPrice && (!product.price || product.price > maxPrice)) return false;
      const haystack = normalize(`${product.name} ${product.article} ${product.subtype} ${product.color} ${product.material} ${product.brand}`);
      if (query && !query.split(" ").every((token) => haystack.includes(token))) return false;
      if (subtype && !normalize(product.subtype).includes(subtype)) return false;
      if (color && !normalize(`${product.color} ${product.parameters.filter((item) => /цвет/i.test(item.name)).map((item) => item.value).join(" ")}`).includes(color)) return false;
      if (material && !normalize(`${product.material} ${product.parameters.filter((item) => /материал|ткань/i.test(item.name)).map((item) => item.value).join(" ")}`).includes(material)) return false;
      if (widthMinMm && (!product.widthMm || product.widthMm < widthMinMm)) return false;
      if (widthMaxMm && (!product.widthMm || product.widthMm > widthMaxMm)) return false;
      if (depthMinMm && (!product.depthMm || product.depthMm < depthMinMm)) return false;
      if (depthMaxMm && (!product.depthMm || product.depthMm > depthMaxMm)) return false;
      if (heightMinMm && (!product.heightMm || product.heightMm < heightMinMm)) return false;
      if (heightMaxMm && (!product.heightMm || product.heightMm > heightMaxMm)) return false;
      return true;
    });
    if (sort === "price_asc") matched.sort((left, right) => (left.price || Number.POSITIVE_INFINITY) - (right.price || Number.POSITIVE_INFINITY));
    if (sort === "price_desc") matched.sort((left, right) => (right.price || 0) - (left.price || 0));
    const subtypes = Array.from(new Set(matched.map((product) => product.subtype).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru")).slice(0, 24);
    const start = (page - 1) * limit;
    const selectedProducts = ids.size ? matched.slice(0, 100) : matched.slice(start, start + limit);
    const pageProducts = selectedProducts.map(({ _trail, _updatedAt, ...product }) => ({ ...product, canonicalUrl: product.url, updatedAt: _updatedAt, provenance: product.source === "leve-home" ? "leve_home_yml" : "norrmobler_yml" }));
    return Response.json({
      products: pageProducts, total: matched.length, page, limit, subtypes,
      brands: FURNITURE_CATALOG_SOURCES.map(({ id, name }) => ({ id, name, available: !unavailableSources.includes(id) })),
      unavailableSources,
    });
  } catch {
    return Response.json({ error: "Каталог временно недоступен. Попробуйте ещё раз." }, { status: 502 });
  }
}
