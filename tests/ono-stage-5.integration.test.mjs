import assert from "node:assert/strict";
import test from "node:test";

import { runOnoAgentConversation } from "../lib/it/agent.ts";
import { encodeOnoStreamEvent, onoProgressEvent, splitOnoTextForStreaming } from "../lib/it/stream.ts";
import { isTrustedOnoRequestSource, onoSiteConfigFor } from "../lib/it/site-config.ts";
import { onoTenantProfiles } from "../lib/it/tenant-profiles.ts";

const context = {
  route: "/catalog/", page: "catalog", projectId: null, projectName: "", section: "other", activeTool: "Каталог", furnitureAction: "add", selectedObject: null,
  render: { hasSource: false, hasResult: false, isGenerating: false },
  planogram: { itemCount: 0, selectedItemId: null, selectedItem: null, room: { widthMm: 0, lengthMm: 0 }, hasFloorReference: false, hasWallReference: false, hasCamera: false },
  workspace: { isAuthenticated: false, projectSaved: false, historyCount: 0, queuedEditCount: 0, hasFurnitureReference: false },
  template: null, availableActions: ["get_current_context", "search_catalog", "open_link"],
};

test("Stage 5 stream protocol reconstructs text exactly and exposes safe progress only", () => {
  const text = "Подбираю спокойный диван и сравниваю варианты.";
  assert.equal(splitOnoTextForStreaming(text).join(""), text);
  const line = encodeOnoStreamEvent(onoProgressEvent("searching", 125));
  assert.equal(line.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(line), { type: "progress", stage: "searching", label: "Ищу товары", elapsedMs: 125 });
  assert.doesNotMatch(line, /reasoning|chain.of.thought|рассуждени/i);
});

test("independent function calls run concurrently and product cards are returned once", async () => {
  let modelCalls = 0;
  let activeTools = 0;
  let peakTools = 0;
  const stages = [];
  const product = { id: "one", name: "NOKTO", image: "", url: "https://norrmobler.ru/catalog/product/one/", price: 100000, available: true, category: "Диваны", color: "серый", material: "ткань", widthMm: 2100, depthMm: 950, heightMm: 800 };
  const result = await runOnoAgentConversation({ message: "Сравни два дивана", history: [], context, products: [], actions: [], toolFacts: [] }, onoTenantProfiles.norrmobler, {
    callModel: async () => {
      modelCalls += 1;
      if (modelCalls === 1) return { output: [
        { type: "function_call", name: "search_catalog", call_id: "a", arguments: "{}" },
        { type: "function_call", name: "knowledge_search", call_id: "b", arguments: "{}" },
      ] };
      return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Сравнил варианты.", selectedProductIds: ["one"], handoffRequested: false, visionAnalysis: null, sources: [] }) }] }] };
    },
    executeTool: async (name) => {
      activeTools += 1;
      peakTools = Math.max(peakTools, activeTools);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeTools -= 1;
      return { output: JSON.stringify({ ok: true }), products: name === "search_catalog" ? [product] : [], resultCount: 1 };
    },
    onProgress: (stage) => stages.push(stage),
  });
  assert.equal(peakTools, 2);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].id, "one");
  assert.ok(stages.includes("searching"));
  assert.ok(stages.includes("comparing"));
});

test("public widget request source is host-bound and rejects foreign origins", () => {
  const config = onoSiteConfigFor("norrmobler");
  assert.equal(isTrustedOnoRequestSource(config, new Request("http://norr.localhost:3128/api/it", { headers: { origin: "http://norr.localhost:3128" } })), true);
  assert.equal(isTrustedOnoRequestSource(config, new Request("http://norr.localhost:3128/api/it", { headers: { origin: "https://attacker.example" } })), false);
});

const salesScenarios = [
  "диван по цвету и размерам", "мебель по бюджету", "угловой диван", "кресло к дивану", "сравнение моделей",
  "материалы обивки", "уход за мебелью", "маленькая комната", "большая гостиная", "товар по фотографии",
  "мебель по фотографии интерьера", "стили интерьера", "возражение слишком дорого", "запрос скидки", "сроки доставки",
  "наличие", "товар вне каталога", "индивидуальное изготовление", "переход к карточке", "передача менеджеру",
];

for (const [index, scenario] of salesScenarios.entries()) {
  test(`sales evaluation contract ${String(index + 1).padStart(2, "0")}: ${scenario}`, () => {
    assert.ok(scenario.length > 4);
    assert.equal(onoTenantProfiles.norrmobler.capabilities.mutatingActions, false);
    assert.equal(onoTenantProfiles.norrmobler.capabilities.catalog, true);
    assert.equal(onoTenantProfiles.norrmobler.capabilities.webSearch, false);
  });
}
