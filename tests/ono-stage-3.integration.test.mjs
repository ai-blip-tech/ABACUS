import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runOnoAgentConversation } from "../lib/it/agent.ts";
import { runItTurn } from "../lib/it/core.ts";
import { searchOnoKnowledge } from "../lib/it/knowledge-base.ts";
import { navigationManifestFor } from "../lib/it/navigation-manifest.ts";
import { NORR_SALES_MANAGER_POLICY, NORR_UAT_SCENARIOS } from "../lib/it/sales-manager-profile.ts";
import { onoTenantProfiles } from "../lib/it/tenant-profiles.ts";
import { onoToolDefinitions } from "../lib/it/tool-contracts.ts";
import { templateRegistry } from "../lib/templates/registry.ts";

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

test("Stage 3 knowledge retrieval is isolated by tenant", () => {
  const norr = searchOnoKnowledge(onoTenantProfiles.norrmobler, "коммерческие условия скидка доставка", 6);
  const roomDesign = searchOnoKnowledge(onoTenantProfiles.roomdesign, "коммерческие условия скидка доставка", 6);
  assert.ok(norr.some((record) => record.id === "norr-commercial-terms"));
  assert.ok(!roomDesign.some((record) => record.scope === "norrmobler"));
  assert.ok(!norr.some((record) => record.scope === "roomdesign"));
});

test("Stage 3 exposes only read-only catalog and knowledge tools", () => {
  const names = onoToolDefinitions.map((tool) => tool.name);
  assert.deepEqual(names, ["knowledge_search", "search_catalog", "get_product_details", "compare_products", "get_product_url"]);
  assert.ok(names.every((name) => !/generate|charge|order|reserve|save|delete/i.test(name)));
});

test("NORR manager profile is injected without Room Design product knowledge", async () => {
  let request;
  const result = await runOnoAgentConversation(
    { message: "Есть ли доставка?", history: [], context, products: [], actions: [], toolFacts: [] },
    onoTenantProfiles.norrmobler,
    {
      callModel: async (value) => {
        request = value;
        return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Условия подтвердит менеджер.", selectedProductIds: [], handoffRequested: true }) }] }] };
      },
      executeTool: async () => { throw new Error("not called"); },
    },
  );
  assert.match(request.instructions, /профессиональный AI-консультант/i);
  assert.match(JSON.stringify(request.input), /ROOM_DESIGN_PRODUCT_KNOWLEDGE=not_available_in_this_tenant/);
  assert.equal(result.handoffRequested, true);
  assert.ok(NORR_SALES_MANAGER_POLICY.includes("называешь себя AI-ассистентом"));
  assert.equal(NORR_UAT_SCENARIOS.length, 6);
});

test("Room Design manifest contains every registered template with a stable route", () => {
  const entries = navigationManifestFor("roomdesign").entries.filter((entry) => entry.pageType === "template");
  assert.equal(entries.length, templateRegistry.length);
  assert.equal(new Set(entries.map((entry) => entry.path)).size, templateRegistry.length);
  assert.ok(entries.some((entry) => entry.path === "/templates/light-scenarios"));
});

test("registered guidance highlights but never clicks or runs a generation", async () => {
  const templateContext = { ...context, route: "/templates", page: "templates", section: "templates" };
  const turn = await runItTurn(
    { message: "Где найти сценарии света?", context: templateContext },
    { answerConversation: async () => "Карточка находится второй в каталоге." },
  );
  assert.deepEqual(turn.actions?.map((action) => action.type), ["focus", "highlight", "guide"]);
  assert.ok(turn.actions?.every((action) => action.target === "template-light-scenarios"));
  assert.ok(turn.actions?.every((action) => !["click", "submit", "generate"].includes(action.type)));
});

test("shared SDK host owns the explicit selector allowlist", async () => {
  const sdk = await readFile(new URL("../public/ono-widget.js", import.meta.url), "utf8");
  assert.match(sdk, /actionTargets/);
  assert.match(sdk, /widget\.ui_action/);
  assert.doesNotMatch(sdk, /\.click\(/);
});
