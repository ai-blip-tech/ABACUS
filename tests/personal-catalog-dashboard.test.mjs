import assert from "node:assert/strict";
import test from "node:test";

import { buildPersonalCatalogDashboard, extractProjectProductUsage } from "../lib/personal-catalog-dashboard.ts";

const furnitureProduct = (overrides = {}) => ({
  id: "chair-1", sourceId: "chair-1", source: "norrmobler", name: "Кресло ROM", article: "ROM-1",
  image: "https://example.com/chair.jpg", images: ["https://example.com/chair.jpg"], url: "https://example.com/chair",
  price: 1, oldPrice: 0, available: true, category: "Кресла", subtype: "Кресло", color: "Каталожный цвет",
  material: "Ткань", brand: "ROM", widthMm: 800, depthMm: 800, heightMm: 900, description: "", parameters: [],
  ...overrides,
});

const planItem = (id, overrides = {}) => ({
  id, name: "Кресло ROM", referenceProductId: "chair-1", referenceArticle: "ROM-1", referenceName: "Кресло ROM",
  referenceImage: "https://saved.example/chair.jpg", referenceColor: "Bordeaux 23", referenceMaterial: "Букле", ...overrides,
});

test("project usage ignores render history and deduplicates one project item across live collections", () => {
  const projects = [{ id: "p1", updated_at: "2026-10-18T10:00:00Z", state_json: JSON.stringify({
    planItems: [planItem("placed-1")],
    proposalItems: [planItem("placed-1")],
    historyVersions: [{ proposalItems: [planItem("placed-1"), planItem("history-only")] }],
  }) }];
  const usages = extractProjectProductUsage(projects);
  assert.equal(usages.length, 1);
  assert.equal(usages[0].projectItemId, "placed-1");
});

test("dashboard separates placement count from unique project count and preserves saved variant", () => {
  const projects = [
    { id: "p1", updated_at: "2026-10-18T10:00:00Z", state_json: JSON.stringify({ planItems: [planItem("placed-1"), planItem("placed-2")] }) },
    { id: "p2", updated_at: "2026-10-18T11:00:00Z", state_json: JSON.stringify({ proposalItems: [planItem("placed-3")] }) },
  ];
  const dashboard = buildPersonalCatalogDashboard({ projects, furnitureProducts: [furnitureProduct()] });
  assert.equal(dashboard.projectsCount, 2);
  assert.equal(dashboard.uniqueProductsCount, 1);
  assert.equal(dashboard.topProducts[0].uniqueProjectCount, 2);
  assert.equal(dashboard.topProducts[0].usageCount, 3);
  assert.equal(dashboard.topProducts[0].variantLabel, "Bordeaux 23 · Букле");
  assert.equal(dashboard.topProducts[0].brandName, "NORR Møbler");
});

test("general catalog products never become personal products without a saved project item", () => {
  const dashboard = buildPersonalCatalogDashboard({ projects: [{ id: "empty", state_json: "{}" }], furnitureProducts: [furnitureProduct()] });
  assert.equal(dashboard.uniqueProductsCount, 0);
  assert.deepEqual(dashboard.topProducts, []);
  assert.deepEqual(dashboard.brands, []);
  assert.equal(dashboard.furnitureState, "empty");
});

test("brand shares are deterministic and sum to one hundred", () => {
  const projects = [{ id: "p1", updated_at: "2026-10-18T10:00:00Z", state_json: JSON.stringify({
    planItems: [planItem("a"), planItem("b")],
    technicalLighting: { fixtures: [{ id: "light-1", product: { id: "gomoon:1", article: "G-1", name: "Светильник", brand: "GoMoon", provider: "gomoon" } }] },
  }) }];
  const dashboard = buildPersonalCatalogDashboard({ projects, furnitureProducts: [furnitureProduct()] });
  assert.equal(dashboard.brands.reduce((sum, brand) => sum + brand.sharePercent, 0), 100);
  assert.deepEqual(dashboard.brands.map((brand) => [brand.brandName, brand.sharePercent]), [["NORR Møbler", 67], ["GoMoon", 33]]);
});

test("saved legacy ROM brand values are grouped under NORR Møbler", () => {
  const projects = [{ id: "p1", state_json: JSON.stringify({ planItems: [planItem("placed-1", { referenceBrand: "ROM" })] }) }];
  const dashboard = buildPersonalCatalogDashboard({ projects, furnitureProducts: [furnitureProduct()] });
  assert.equal(dashboard.topProducts[0].brandName, "NORR Møbler");
  assert.equal(dashboard.topProducts[0].brandId, "norr-mobler");
  assert.deepEqual(dashboard.brands.map((brand) => brand.brandName), ["NORR Møbler"]);
});
