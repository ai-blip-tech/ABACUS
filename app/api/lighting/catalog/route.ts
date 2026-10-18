import { loadLightingCatalog } from "@/lib/lighting-catalog";

const BRANDS = [{ id: "gomoon", name: "GoMoon" }] as const;

const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const query = normalize(search.get("q") || "");
  const type = search.get("type") || "all";
  const brand = search.get("brand") || "all";
  const availableOnly = search.get("available") === "1";
  const page = Math.max(1, Number(search.get("page")) || 1);
  const limit = Math.min(48, Math.max(6, Number(search.get("limit")) || 24));
  try {
    const products = await loadLightingCatalog();
    const matched = products.filter((product) => {
      if (brand !== "all" && product.provider !== brand) return false;
      if (type !== "all" && product.type !== type) return false;
      if (availableOnly && !product.available) return false;
      if (!query) return true;
      return normalize(`${product.name} ${product.article} ${product.category} ${product.categoryTrail}`).includes(query);
    });
    const start = (page - 1) * limit;
    return Response.json({
      brand: "GoMoon",
      provider: "gomoon",
      brands: BRANDS,
      selectedBrand: brand,
      products: matched.slice(start, start + limit),
      total: matched.length,
      page,
      limit,
      counts: products.reduce<Record<string, number>>((result, product) => ({ ...result, [product.type]: (result[product.type] || 0) + 1 }), {}),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Каталог GoMoon временно недоступен." }, { status: 502 });
  }
}

