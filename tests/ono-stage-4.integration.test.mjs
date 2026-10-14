import assert from "node:assert/strict";
import test from "node:test";

import { runOnoAgentConversation } from "../lib/it/agent.ts";
import { rankCatalogRecommendations } from "../lib/it/recommendations.ts";
import { onoKnowledgeHealth, searchOnoKnowledge } from "../lib/it/knowledge-base.ts";
import { summarizeOnoQuality } from "../lib/it/quality.ts";
import { onoTenantProfiles } from "../lib/it/tenant-profiles.ts";
import { normalizeSearchCatalogArguments, onoToolDefinitionsFor } from "../lib/it/tool-contracts.ts";

const context = {
  route: "/catalog/",
  page: "catalog",
  projectId: null,
  projectName: "",
  section: "other",
  activeTool: "Каталог",
  furnitureAction: "add",
  selectedObject: null,
  render: { hasSource: false, hasResult: false, isGenerating: false },
  planogram: { itemCount: 0, selectedItemId: null, selectedItem: null, room: { widthMm: 0, lengthMm: 0 }, hasFloorReference: false, hasWallReference: false, hasCamera: false },
  workspace: { isAuthenticated: false, projectSaved: false, historyCount: 0, queuedEditCount: 0, hasFurnitureReference: false },
  template: null,
  availableActions: ["get_current_context", "search_catalog", "open_link"],
};

test("Stage 4 sends an image to Vision and returns explicit uncertainty", async () => {
  let modelRequest;
  const profile = { ...onoTenantProfiles.norrmobler, capabilities: { ...onoTenantProfiles.norrmobler.capabilities, webSearch: false } };
  const result = await runOnoAgentConversation(
    { message: "Найди похожее кресло", image: "data:image/png;base64,AAAA", history: [], context, products: [], actions: [], toolFacts: [] },
    profile,
    {
      callModel: async (request) => {
        modelRequest = request;
        return {
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            message: "Вижу кресло бордового оттенка; материал по фото нужно подтвердить.",
            selectedProductIds: [],
            handoffRequested: false,
            visionAnalysis: {
              subject: "furniture",
              categories: ["кресло"],
              colors: ["бордовый"],
              materials: [],
              styles: ["современный"],
              confidence: "medium",
              uncertain: ["материал", "точный оттенок"],
              requiresConfirmation: true,
            },
            sources: [],
          }) }] }],
          usage: { input_tokens: 20, output_tokens: 30, total_tokens: 50 },
        };
      },
      executeTool: async () => { throw new Error("not called"); },
    },
  );
  assert.match(JSON.stringify(modelRequest.input), /input_image/);
  assert.match(JSON.stringify(modelRequest.input), /Каталог доступен на следующем ходе после подтверждения/);
  assert.ok(!modelRequest.tools.some((tool) => tool.name === "search_catalog"), "first image turn must confirm visual assumptions before catalog search");
  assert.equal(result.visionAnalysis?.subject, "furniture");
  assert.equal(result.visionAnalysis?.requiresConfirmation, true);
  assert.equal(result.modelUsage.totalTokens, 50);
  assert.equal(result.modelUsage.usageReports, 1);
});

test("model calls without provider usage are not treated as confirmed zero cost", async () => {
  const profile = { ...onoTenantProfiles.roomdesign, capabilities: { ...onoTenantProfiles.roomdesign.capabilities, webSearch: false } };
  const result = await runOnoAgentConversation(
    { message: "Как открыть шаблоны?", history: [], context, products: [], actions: [], toolFacts: [] },
    profile,
    {
      callModel: async () => ({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          message: "Откройте раздел «Шаблоны».", selectedProductIds: [], handoffRequested: false, visionAnalysis: null, sources: [],
        }) }] }],
      }),
      executeTool: async () => { throw new Error("not called"); },
    },
  );
  assert.equal(result.modelUsage.calls, 1);
  assert.equal(result.modelUsage.usageReports, 0);
  assert.equal(result.modelUsage.totalTokens, 0);
});

test("Web Search is capability-gated and custom read-only tools stay available", () => {
  const disabled = onoToolDefinitionsFor(false);
  const enabled = onoToolDefinitionsFor(true);
  assert.ok(!disabled.some((tool) => tool.type === "web_search"));
  assert.ok(enabled.some((tool) => tool.type === "web_search" && tool.search_context_size === "low"));
  assert.ok(enabled.some((tool) => tool.name === "search_catalog"));
  assert.ok(enabled.every((tool) => !/generate|order|payment|delete/i.test(String(tool.name || ""))));
});

test("Knowledge base is versioned, tenant-isolated and complete enough for Stage 4", () => {
  const norrHealth = onoKnowledgeHealth(onoTenantProfiles.norrmobler);
  const roomHealth = onoKnowledgeHealth(onoTenantProfiles.roomdesign);
  assert.equal(norrHealth.missingSource, 0);
  assert.equal(roomHealth.missingVersion, 0);
  assert.ok(norrHealth.records >= 6);
  assert.ok(searchOnoKnowledge(onoTenantProfiles.norrmobler, "визуальный поиск фотография похожий товар", 6).some((record) => record.id === "global-visual-search-boundary"));
  assert.ok(!searchOnoKnowledge(onoTenantProfiles.roomdesign, "каталог NORR", 6).some((record) => record.scope === "norrmobler"));
});

test("Recommendation ranking prefers confirmed visual constraints without inventing fields", () => {
  const input = normalizeSearchCatalogArguments({
    category: "armchair", color: "бордовый", material: null, brand: null, subtype: null,
    textQuery: null, style: null, priceMin: null, priceMax: 200000, currency: "RUB",
    dimensions: null, availability: "any", variants: [], sort: "relevance", page: 1, pageSize: 5,
  });
  const product = (id, color, price) => ({ id, name: id, image: "", url: "", price, available: true, category: "Кресла", color, material: "", widthMm: null, depthMm: null, heightMm: null });
  const ranked = rankCatalogRecommendations([product("neutral", "серый", 150000), product("visual", "бордовый", 190000)], input);
  assert.equal(ranked[0].product.id, "visual");
  assert.ok(ranked[0].reasons.some((reason) => reason.includes("цвет")));
});

test("Quality metrics distinguish tool success, failure and result volume", () => {
  const summary = summarizeOnoQuality({ toolTrace: [
    { name: "knowledge_search", status: "success", durationMs: 4, resultCount: 3 },
    { name: "search_catalog", status: "success", durationMs: 8, resultCount: 5 },
    { name: "get_product_details", status: "error", durationMs: 2, resultCount: 0 },
  ] });
  assert.deepEqual(summary, {
    toolCalls: 3,
    successfulToolCalls: 2,
    failedToolCalls: 1,
    catalogSearches: 1,
    catalogResults: 5,
    knowledgeSearches: 1,
    knowledgeResults: 3,
  });
});
