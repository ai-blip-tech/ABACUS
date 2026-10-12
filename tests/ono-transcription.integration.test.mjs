import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const dataDir = await mkdtemp(join(tmpdir(), "room-design-ono-transcription-"));
process.env.ROOM_DESIGN_DATA_DIR = dataDir;
process.env.OPENAI_API_KEY = "integration-test-placeholder";
process.env.OPENAI_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(join(process.cwd(), `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });

const auth = await import("../lib/auth.ts");
const { database } = await import("../lib/server-runtime.ts");
const { ensureOnoFinanceStore } = await import("../lib/it/finance.ts");
const { POST } = await import("../app/api/it/transcribe/route.ts");
await auth.ensureStore();
await ensureOnoFinanceStore();

const user = {
  id: "ono-voice-user",
  email: "ono-voice@example.test",
  role: "user",
  tenantId: "tenant_norrmobler",
  tenantSlug: "norrmobler",
  tenantRole: "member",
  firstName: "Voice",
  lastName: "Tester",
  phone: "",
  companyRole: "",
};
const now = new Date().toISOString();
await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, first_name, last_name, created_at) VALUES (?, ?, 'x', 'x', 'google-only', 600000, 'user', ?, ?, ?)")
  .bind(user.id, user.email, user.firstName, user.lastName, now).run();
await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
  .bind(user.tenantId, user.id, now).run();
const sessionToken = await auth.createSession(user);

const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.ONO_V2_ENABLED;
  await rm(dataDir, { recursive: true, force: true });
});

function transcriptionRequest(requestId) {
  const form = new FormData();
  form.append("requestId", requestId);
  form.append("audio", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }), "message.webm");
  return new Request("http://127.0.0.1:3128/api/it/transcribe", {
    method: "POST",
    headers: {
      cookie: `room_session=${sessionToken}`,
      origin: "http://127.0.0.1:3128",
    },
    body: form,
  });
}

test("disabled Ono rejects voice before OpenAI and before financial ledger", async () => {
  process.env.ONO_V2_ENABLED = "false";
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("OpenAI must not be called while Ono is disabled");
  };

  const response = await POST(transcriptionRequest("30000000-0000-4000-8000-000000000001"));
  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0);
  const row = await database.prepare("SELECT COUNT(*) AS count FROM ono_cost_ledger").first();
  assert.equal(Number(row.count), 0);
});

test("enabled voice attributes cost to the signed-in user's tenant regardless of entry domain", async () => {
  process.env.ONO_V2_ENABLED = "true";
  let providerCalls = 0;
  globalThis.fetch = async (url) => {
    providerCalls += 1;
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    return Response.json({
      text: "Добавь светлый диван",
      usage: { type: "tokens", input_tokens: 1_000, output_tokens: 100, total_tokens: 1_100 },
    });
  };

  const requestId = "30000000-0000-4000-8000-000000000002";
  const response = await POST(transcriptionRequest(requestId));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, "Добавь светлый диван");
  assert.equal(providerCalls, 1);

  const row = await database.prepare("SELECT * FROM ono_cost_ledger WHERE request_id = ?").bind(requestId).first();
  assert.equal(row.user_id, user.id);
  assert.equal(row.tenant_id, user.tenantId);
  assert.equal(row.site_id, "roomdesign");
  assert.equal(row.operation_type, "ono_transcription");
  assert.equal(row.endpoint, "openai.audio.transcriptions");
  assert.equal(row.model, "gpt-4o-mini-transcribe");
  assert.equal(row.status, "succeeded");
  assert.equal(row.model_calls, 1);
  assert.equal(row.input_tokens, 1_000);
  assert.equal(row.output_tokens, 100);
  assert.equal(row.total_tokens, 1_100);
  assert.equal(row.net_micro_usd, 1_750);
  assert.equal(row.gross_micro_usd, Math.round(1_750 * 2.2));

  const replay = await POST(transcriptionRequest(requestId));
  assert.equal(replay.status, 409);
  assert.equal(providerCalls, 1);
  const count = await database.prepare("SELECT COUNT(*) AS count FROM ono_cost_ledger WHERE request_id = ?").bind(requestId).first();
  assert.equal(Number(count.count), 1);
});

test("provider failure is recorded once without inventing a token cost", async () => {
  process.env.ONO_V2_ENABLED = "true";
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json({ error: { code: "provider_rejected", type: "invalid_request_error" } }, { status: 400 });
  };

  const requestId = "30000000-0000-4000-8000-000000000003";
  assert.equal((await POST(transcriptionRequest(requestId))).status, 502);
  assert.equal((await POST(transcriptionRequest(requestId))).status, 409);
  assert.equal(providerCalls, 1);
  const row = await database.prepare("SELECT status, model_calls, net_micro_usd, gross_micro_usd, error_code FROM ono_cost_ledger WHERE request_id = ?").bind(requestId).first();
  assert.equal(row.status, "failed");
  assert.equal(row.model_calls, 1);
  assert.equal(row.net_micro_usd, null);
  assert.equal(row.gross_micro_usd, null);
  assert.equal(row.error_code, "provider_rejected");
});
