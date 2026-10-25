import { matchesCatalogType } from "@/lib/catalog-filter";
import { FURNITURE_CATALOG_SOURCES } from "@/lib/furniture-catalog";
import { loadStudioCatalog } from "@/lib/studio-catalog";
import { matchesCatalogSearch, catalogDiscount } from "@/lib/catalog-search";
import { matchesCatalogFeature } from "@/lib/catalog-features";
import { furnitureCatalogNavigation, matchesFurnitureBrand, matchesCatalogColor } from "@/lib/furniture-catalog-navigation";
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
  const recliner=search.get("recliner")||"";
  const sleeper=search.get("sleeper")||"";
  const ottoman=search.get("ottoman")||"";
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
    const { products, unavailableSources } = await loadStudioCatalog();
    const navigation = furnitureCatalogNavigation(products,{type,brands:selectedSources,query});
    const matched = products.filter((product) => {
      if (ids.size) return ids.has(product.id) || (product.source === "norrmobler" && ids.has(product.sourceId));
      // Global search deliberately bypasses sidebar filters; clearing it restores them.
      if (query) return matchesCatalogSearch(product,query);
      if (!matchesFurnitureBrand(product, selectedSources)) return false;
      if (!matchesCatalogType(product, type, product._trail || "")) return false;
      if (availableOnly && !product.available) return false;
      if (minPrice && (!product.price || product.price < minPrice)) return false;
      if (maxPrice && (!product.price || product.price > maxPrice)) return false;
      if (subtype && normalize(product.subtype) !== subtype) return false;
      if (!matchesCatalogColor(product,color)) return false;
      if ((type==="sofa"||type==="armchair")&&(!matchesCatalogFeature(product,"recliner",recliner)||!matchesCatalogFeature(product,"sleeper",sleeper))) return false;
      if (type==="sofa"&&!matchesCatalogFeature(product,"ottoman",ottoman)) return false;
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
    if (sort === "discount_desc") matched.sort((left,right)=>catalogDiscount(right)-catalogDiscount(left));
    const subtypes = navigation.categorySubtypes[type] || [];
    const start = (page - 1) * limit;
    const selectedProducts = ids.size ? matched.slice(0, 100) : matched.slice(start, start + limit);
    const pageProducts = selectedProducts.map(({ _trail, _updatedAt, ...product }) => ({ ...product, canonicalUrl: product.url, updatedAt: _updatedAt, provenance: product.source === "gomoon" ? "gomoon_yml" : product.source === "leve-home" ? "leve_home_yml" : "norrmobler_yml" }));
    return Response.json({
      products: pageProducts, total: matched.length, page, limit, subtypes, ...navigation,
      brands: [...FURNITURE_CATALOG_SOURCES, {id:"gomoon",name:"GoMoon"}].map(({ id, name }) => ({ id, name, available: !unavailableSources.includes(id) })),
      unavailableSources,
    });
  } catch {
    return Response.json({ error: "Каталог временно недоступен. Попробуйте ещё раз." }, { status: 502 });
  }
}
