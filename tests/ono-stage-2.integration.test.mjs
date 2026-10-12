import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "room-design-ono-stage-2-"));
process.env.ROOM_DESIGN_DATA_DIR = dataDir;

const { ensureStore } = await import("../lib/auth.ts");
const { database } = await import("../lib/server-runtime.ts");
const { calculateOnoTextCost, beginOnoFinancialUsage, completeOnoFinancialUsage, ensureOnoFinanceStore } = await import("../lib/it/finance.ts");
const { deleteOnoConversation, loadOnoContext, onoVisitorCookie, resolveOnoConversation, saveOnoTurn, storedOnoReply } = await import("../lib/it/memory.ts");
const { navigationManifestFor } = await import("../lib/it/navigation-manifest.ts");
const { onoSiteConfigFor } = await import("../lib/it/site-config.ts");
const { resolveOnoTenantProfile } = await import("../lib/it/tenant-profiles.ts");

await ensureStore();
await ensureOnoFinanceStore();

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

test("anonymous Ono memory survives navigation and keeps tenant isolation", async () => {
  const firstRequest = new Request("http://127.0.0.1:3128/api/it");
  const first = await resolveOnoConversation({ request: firstRequest, tenantId: "tenant_roomdesign", siteId: "roomdesign", user: null });
  await saveOnoTurn({
    session: first.session,
    requestId: "10000000-0000-4000-8000-000000000001",
    userText: "Найди синий диван",
    imagePresent: false,
    assistantText: "Нашёл вариант.",
    state: { catalogSearch: { category: "sofa", color: "синий" } },
  });
  const nextRequest = new Request("http://127.0.0.1:3128/templates", { headers: { cookie: `ono_visitor=${first.visitorId}` } });
  const restored = await resolveOnoConversation({ request: nextRequest, tenantId: "tenant_roomdesign", siteId: "roomdesign", user: null });
  assert.equal(restored.session.id, first.session.id);
  const context = await loadOnoContext(restored.session);
  assert.equal(context.messages.length, 2);
  assert.equal(context.state.catalogSearch.color, "синий");
  assert.equal((await storedOnoReply(first.session.id, "10000000-0000-4000-8000-000000000001"))?.text, "Нашёл вариант.");
  await deleteOnoConversation(first.session.id, "tenant_roomdesign", null, first.visitorId);
  assert.equal((await database.prepare("SELECT id FROM ono_chat_sessions WHERE id = ?").bind(first.session.id).first()), null);
});

test("anonymous Ono identity cookie is hardened in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.match(onoVisitorCookie("visitor-1234567890"), /; HttpOnly; Secure; SameSite=Lax;/);
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
});

test("every Ono turn stores exact GPT-6.1 Sol NET and GROSS", async () => {
  const request = new Request("http://127.0.0.1:3128/api/it");
  const conversation = await resolveOnoConversation({ request, tenantId: "tenant_roomdesign", siteId: "roomdesign", user: null });
  const requestId = "20000000-0000-4000-8000-000000000002";
  assert.equal(await beginOnoFinancialUsage({ requestId, sessionId: conversation.session.id, userId: null, visitorId: conversation.visitorId, tenantId: "tenant_roomdesign", siteId: "roomdesign", model: "gpt-6.1-sol" }), true);
  assert.equal(await beginOnoFinancialUsage({ requestId, sessionId: conversation.session.id, userId: null, visitorId: conversation.visitorId, tenantId: "tenant_roomdesign", siteId: "roomdesign", model: "gpt-6.1-sol" }), false);
  await completeOnoFinancialUsage({ requestId, model: "gpt-6.1-sol", status: "succeeded", usage: { inputTokens: 13_322, cachedInputTokens: 0, outputTokens: 313, totalTokens: 13_635, calls: 2 } });
  const row = await database.prepare("SELECT * FROM ono_cost_ledger WHERE request_id = ?").bind(requestId).first();
  assert.equal(row.status, "succeeded");
  assert.equal(row.model_calls, 2);
  assert.equal(row.net_micro_usd, 29_774);
  assert.equal(row.gross_micro_usd, Math.round(29_774 * 2.2));
  assert.equal(calculateOnoTextCost("unknown", { inputTokens: 1, outputTokens: 1, totalTokens: 2, calls: 1 }, 2.2).netMicroUsd, null);
  assert.deepEqual(
    calculateOnoTextCost("gpt-6-astra", { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000, totalTokens: 2_000_000, calls: 1 }, 2),
    {
      pricingSnapshot: {
        version: "openai-text-2026-10-12",
        source: "https://developers.openai.com/api/docs/models/gpt-6-astra",
        inputUsd: 10,
        cachedInputUsd: 1,
        outputUsd: 50,
        model: "gpt-6-astra",
        endpoint: "openai.responses",
        currency: "USD",
        unit: "per_million_tokens",
      },
      netMicroUsd: 60_000_000,
      grossMicroUsd: 120_000_000,
    },
  );
});

test("voice transcription pricing uses its own OpenAI endpoint snapshot", () => {
  assert.deepEqual(
    calculateOnoTextCost(
      "gpt-4o-mini-transcribe",
      { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, calls: 1 },
      2.2,
      "openai.audio.transcriptions",
    ),
    {
      pricingSnapshot: {
        version: "openai-audio-2026-10-13",
        source: "https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe",
        inputUsd: 1.25,
        cachedInputUsd: 0,
        outputUsd: 5,
        model: "gpt-4o-mini-transcribe",
        endpoint: "openai.audio.transcriptions",
        currency: "USD",
        unit: "per_million_tokens",
      },
      netMicroUsd: 1_750,
      grossMicroUsd: 3_850,
    },
  );
});

test("Stage 2 exposes versioned site config and navigation manifests", () => {
  const config = onoSiteConfigFor("roomdesign");
  assert.equal(config.capabilities.persistentMemory, true);
  assert.equal(config.capabilities.mutatingActions, false);
  assert.equal(config.retentionDays, 30);
  assert.equal(config.navigationManifestVersion, navigationManifestFor("roomdesign").version);
  assert.ok(navigationManifestFor("norrmobler").entries.some((entry) => entry.id === "catalog"));
  assert.equal(resolveOnoTenantProfile("norr.localhost:3128").siteId, "norrmobler");
  assert.ok(onoSiteConfigFor("norrmobler").approvedOrigins.includes("http://norr.localhost:3128"));
});
