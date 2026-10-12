import assert from "node:assert/strict";
import test from "node:test";
import { runOnoAgentConversation } from "../lib/it/agent.ts";
import { onoTenantProfiles, resolveOnoTenantProfile } from "../lib/it/tenant-profiles.ts";
import { approvedProductUrl, normalizeSearchCatalogArguments } from "../lib/it/tool-contracts.ts";

const context = {
  route: "/templates",
  page: "templates",
  projectId: null,
  projectName: "",
  section: "templates",
  activeTool: "",
  furnitureAction: "add",
  selectedObject: null,
  render: { hasSource: false, hasResult: false, isGenerating: false },
  planogram: { itemCount: 0, selectedItemId: null, selectedItem: null, room: { widthMm: 0, lengthMm: 0 }, hasFloorReference: false, hasWallReference: false, hasCamera: false },
  workspace: { isAuthenticated: false, projectSaved: false, historyCount: 0, queuedEditCount: 0, hasFurnitureReference: false },
  template: null,
  availableActions: ["get_current_context", "search_catalog"],
};

const basel = {
  id: "35648",
  name: "Диван BASEL",
  image: "https://example.com/basel.jpg",
  url: "https://example.com/basel",
  price: 301612,
  category: "Диваны",
  color: "синий",
  material: "Ткань",
  widthMm: 2000,
  depthMm: 1020,
  heightMm: 1040,
};

const input = (message, history = []) => ({ message, history, context, products: [], actions: [], toolFacts: [] });

test("catalog selection is performed through a model function call with separate size and price fields", async () => {
  const requests = [];
  const executed = [];
  const modelResponses = [
    {
      output: [{
        type: "function_call",
        name: "search_catalog",
        call_id: "call-1",
        arguments: JSON.stringify({
          textQuery: null,
          category: "sofa",
          subtype: null,
          color: "синий",
          material: null,
          style: null,
          priceMin: null,
          priceMax: null,
          currency: null,
          dimensions: { unit: "cm", widthMin: null, widthMax: 300, depthMin: null, depthMax: null, heightMin: null, heightMax: null },
          brand: null,
          availability: "in_stock",
          variants: [],
          sort: "price_asc",
          page: 1,
          pageSize: 5,
        }),
      }],
    },
    { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Нашёл синий диван шириной 200 см.", selectedProductIds: [basel.id] }) }] }] },
  ];
  const result = await runOnoAgentConversation(
    input("Найди синие диваны шириной до 300 см. Бюджет любой"),
    onoTenantProfiles.roomdesign,
    {
      callModel: async (request) => { requests.push(request); return modelResponses.shift(); },
      executeTool: async (name, argumentsValue) => {
        executed.push({ name, argumentsValue });
        return { output: JSON.stringify({ products: [basel], total: 1 }), products: [basel], resultCount: 1 };
      },
    },
  );
  assert.equal(executed[0].name, "search_catalog");
  assert.equal(executed[0].argumentsValue.dimensions.widthMax, 300);
  assert.equal(executed[0].argumentsValue.priceMax, null);
  assert.equal(requests[0].tools.some((tool) => tool.name === "search_catalog"), true);
  assert.doesNotMatch(requests[0].instructions, /NORR/i);
  assert.equal(result.products[0].id, basel.id);
  assert.match(result.text, /синий диван/);
});

test("catalog dimensions are normalized to millimeters without becoming a price", () => {
  const normalized = normalizeSearchCatalogArguments({
    category: "sofa",
    color: "синий",
    priceMax: null,
    dimensions: { unit: "cm", widthMin: null, widthMax: 300, depthMin: null, depthMax: null, heightMin: null, heightMax: null },
    page: 1,
    pageSize: 5,
  });
  assert.equal(normalized.dimensions.widthMax, 3000);
  assert.equal(normalized.priceMax, null);
  assert.equal(normalized.availability, "any");
});

test("the agent can perform a second catalog search after an empty exact result", async () => {
  const colors = [];
  const responses = [
    { output: [{ type: "function_call", name: "search_catalog", call_id: "exact", arguments: JSON.stringify({ color: "синий", category: "sofa" }) }] },
    { output: [{ type: "function_call", name: "search_catalog", call_id: "relaxed", arguments: JSON.stringify({ color: "голубой", category: "sofa" }) }] },
    { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Точного синего варианта нет, поэтому показываю близкий голубой оттенок.", selectedProductIds: [basel.id] }) }] }] },
  ];
  const result = await runOnoAgentConversation(input("Нет синих? Покажи близкие оттенки"), onoTenantProfiles.norrmobler, {
    callModel: async () => responses.shift(),
    executeTool: async (_name, argumentsValue) => {
      colors.push(argumentsValue.color);
      const products = colors.length === 2 ? [basel] : [];
      return { output: JSON.stringify({ products, total: products.length }), products, resultCount: products.length };
    },
  });
  assert.deepEqual(colors, ["синий", "голубой"]);
  assert.equal(result.toolTrace.length, 2);
  assert.match(result.text, /близкий голубой/);
});

test("multi-turn constraints remain present in the model input", async () => {
  let request;
  await runOnoAgentConversation(input("Бюджет любой.", [
    { role: "user", text: "Мне нужен диван." },
    { role: "assistant", text: "Какой цвет?" },
    { role: "user", text: "Синий." },
    { role: "assistant", text: "Какая ширина?" },
    { role: "user", text: "До 300 см." },
  ]), onoTenantProfiles.roomdesign, {
    callModel: async (value) => {
      request = value;
      return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Уточнения сохранены.", selectedProductIds: [] }) }] }] };
    },
    executeTool: async () => { throw new Error("not called"); },
  });
  const serialized = JSON.stringify(request.input);
  assert.match(serialized, /Синий/);
  assert.match(serialized, /До 300 см/);
  assert.match(serialized, /Бюджет любой/);
});

test("tenant profile is derived from the trusted host instead of client input", () => {
  assert.equal(resolveOnoTenantProfile("roomdesign.com.ru").tenantId, "room-design");
  assert.equal(resolveOnoTenantProfile("127.0.0.1:3128").tenantId, "room-design");
  assert.equal(resolveOnoTenantProfile("shop.norrmobler.ru").tenantId, "norr-mobler");
});

test("product navigation rejects non-allowlisted URLs", () => {
  assert.equal(approvedProductUrl("https://norrmobler.ru/catalog/product/example"), "https://norrmobler.ru/catalog/product/example");
  assert.equal(approvedProductUrl("https://evil.example/catalog/product/example"), undefined);
  assert.equal(approvedProductUrl("javascript:alert(1)"), undefined);
});
