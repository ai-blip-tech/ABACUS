import {tileDesigns,matchesTileDesign,prioritizeRecent} from '@/lib/tile-design';
import {floorTileFromProduct} from "@/lib/floor-tile-product";
import { catalogHasModel3D, catalogModelUrl } from "@/lib/catalog-model3d";
import { matchesCatalogType } from "@/lib/catalog-filter";
import { FURNITURE_CATALOG_SOURCES, loadFurnitureCatalog } from "@/lib/furniture-catalog";
import {loadSurfaceCatalog,surfaceCatalogNotice} from "@/lib/surface-catalog";
import { catalogProductHasPhoto, loadStudioCatalog } from "@/lib/studio-catalog";
import { matchesCatalogSearch, catalogDiscount } from "@/lib/catalog-search";
import { matchesCatalogFeature } from "@/lib/catalog-features";
import { furnitureCatalogNavigation, matchesFurnitureBrand, matchesCatalogColor } from "@/lib/furniture-catalog-navigation";
const normalize = (value = "") => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const scope = search.get("scope");
  const ids = new Set((search.get("ids") || "").split(",").map((id) => id.trim()).filter(Boolean));
  const type = search.get("type") || "sofa";
  const query = normalize(search.get("q") || "");
  const subtype = normalize(search.get("subtype") || "");
  const selectedSources = new Set((search.get("brands") || search.get("brand") || "").split(",").map(normalize).filter(Boolean));
  const availableOnly = search.get("available") === "1";
  const minPrice = Math.max(0, Number(search.get("minPrice")) || 0);
  const maxPrice = Math.max(0, Number(search.get("maxPrice")) || 0);
  const color = normalize(search.get("color") || "");
  const covering=search.get("covering")==="1";
  const designs=covering?search.getAll("designs").filter(Boolean):[];
  const colors=covering?search.getAll("colors").map(normalize).filter(Boolean):[];
  const formats=new Set(covering?search.getAll("formats").filter(Boolean):[]);
  if(covering&&search.get("format"))formats.add(search.get("format")!);
  if(covering&&search.get("minPrice")&&search.get("maxPrice")&&minPrice>maxPrice)return Response.json({error:"Минимальная цена не должна превышать максимальную."},{status:400});
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
  const sort = search.get("sort") ?? (covering?"price_asc":"");
  const page = Math.max(1, Number(search.get("page")) || 1);
  const limit = Math.min(30, Math.max(6, Number(search.get("limit")) || 18));

  try {
    const { products:sourceProducts, unavailableSources } = await (scope === "furniture"
      ? loadFurnitureCatalog()
      : (scope === "surfaces" || (type === "porcelain" && !query && !ids.size))
        ? loadSurfaceCatalog().then(products => ({ products, unavailableSources: [] }))
        : loadStudioCatalog());
    const loadedProducts = scope === "furniture" ? sourceProducts.filter(product =>
      catalogProductHasPhoto(product) && !matchesCatalogType(product, "porcelain", product._trail || "") &&
      !matchesCatalogType(product, "sanitary", product._trail || "")) : sourceProducts;
    const products=search.get("covering")==="1"?loadedProducts.map(p=>{if(!matchesCatalogType(p,'porcelain',p._trail||''))return p;try{const tile=floorTileFromProduct(p);return{...p,catalogImage:p.image,widthMm:tile.widthMm,depthMm:tile.heightMm,heightMm:tile.thicknessMm||null,price:tile.price||0,oldPrice:0};}catch{return p;}}):loadedProducts;
    const navigation = furnitureCatalogNavigation(products,{type,brands:selectedSources,query});
    // Facets describe the full available assortment, independent of pagination or active filters.
    const tileFormats=covering?[...new Set(products.filter(p=>matchesCatalogType(p,'porcelain',p._trail||'')&&p.widthMm&&p.depthMm).map(p=>`${p.widthMm}x${p.depthMm}`))].sort((a,b)=>Number(a.split('x')[0])-Number(b.split('x')[0])||Number(a.split('x')[1])-Number(b.split('x')[1])):[];
    const tileDesignOptions=covering?[...new Set(products.filter(p=>matchesCatalogType(p,'porcelain',p._trail||'')).flatMap(tileDesigns))].sort((a,b)=>a.localeCompare(b,'ru')):[];
    let matched = products.filter((product) => {
      if (search.get("model3d") === "1" && !catalogHasModel3D(product)) return false;
      if (ids.size) return ids.has(product.id) || (product.source === "norrmobler" && ids.has(product.sourceId));
      // Global search deliberately bypasses sidebar filters; clearing it restores them.
      if (query) {if(!matchesCatalogSearch(product,query))return false;if(search.get("covering")!=="1")return true;}
      if (!matchesFurnitureBrand(product, selectedSources)) return false;
      if (!matchesCatalogType(product, type, product._trail || "")) return false;
      if (availableOnly && !product.available) return false;
      if (minPrice && (!product.price || product.price < minPrice)) return false;
      if (maxPrice && (!product.price || product.price > maxPrice)) return false;
      if(covering&&search.get("maxPrice")==="0"&&product.price>0)return false;
      if (subtype && normalize(product.subtype) !== subtype) return false;
      if (colors.length?!colors.some(value=>matchesCatalogColor(product,value)):!matchesCatalogColor(product,color)) return false;
      if(!matchesTileDesign(product,designs))return false;
      if(formats.size&&!formats.has(`${product.widthMm}x${product.depthMm}`))return false;
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
    if(sort==="model3d_first")matched.sort((a,b)=>Number(Boolean(catalogModelUrl(b)))*2+Number(catalogHasModel3D(b))-Number(Boolean(catalogModelUrl(a)))*2-Number(catalogHasModel3D(a)));
    if (sort === "price_asc") matched.sort((left, right) => (left.price || Number.POSITIVE_INFINITY) - (right.price || Number.POSITIVE_INFINITY));
    if (sort === "price_desc") matched.sort((left, right) => (right.price || 0) - (left.price || 0));
    if (sort === "discount_desc") matched.sort((left,right)=>catalogDiscount(right)-catalogDiscount(left));
    const hasSurfaceFilter=query||selectedSources.size||availableOnly||colors.length||formats.size||designs.length||minPrice||search.has("maxPrice")||widthMinMm||widthMaxMm||subtype||color||material||depthMinMm||depthMaxMm||heightMinMm||heightMaxMm;
    if(covering&&!hasSurfaceFilter)matched=prioritizeRecent(matched,(search.get("recent")||"").split(",").filter(Boolean));
    const subtypes = navigation.categorySubtypes[type] || [];
    const start = (page - 1) * limit;
    const selectedProducts = ids.size ? matched.slice(0, 100) : matched.slice(start, start + limit);
    const pageProducts = selectedProducts.map(({ _trail, _updatedAt, ...product }) => ({ ...product, canonicalUrl: product.url, updatedAt: _updatedAt, provenance: product.source === "gomoon" ? "gomoon_yml" : product.source === "leve-home" ? "leve_home_yml" : "norrmobler_yml" }));
    return Response.json({
      products: pageProducts, tileFormats, tileDesigns:tileDesignOptions, total: matched.length, page, limit, subtypes, ...navigation,
      brands: (scope === "furniture" ? FURNITURE_CATALOG_SOURCES : [...FURNITURE_CATALOG_SOURCES, {id:"gomoon",name:"GoMoon"}]).map(({ id, name }) => ({ id, name, available: !unavailableSources.includes(id) })),
      unavailableSources, catalogNotice:scope === "furniture" ? "" : surfaceCatalogNotice(),
    });
  } catch {
    return Response.json({ error: "Каталог временно недоступен. Попробуйте ещё раз." }, { status: 502 });
  }
}
