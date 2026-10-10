import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const root = await mkdtemp(join(tmpdir(), "room-design-generate-safety-"));
process.env.ROOM_DESIGN_DATA_DIR = root;
process.env.OPENAI_API_KEY = "integration-test-placeholder";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(join(process.cwd(), `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const auth = await import("../lib/auth.ts");
const billing = await import("../lib/billing.ts");
const { database } = await import("../lib/server-runtime.ts");
const { POST } = await import("../app/api/generate/route.ts");
await auth.ensureStore();
const user = { id: "safety-user", email: "safety@example.test", role: "user", tenantId: "tenant_norrmobler", tenantSlug: "norrmobler", tenantRole: "member", firstName: "Test", lastName: "", phone: "", companyRole: "" };
const now = new Date().toISOString();
await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, first_name, created_at) VALUES (?, ?, 'x', 'x', 'google-only', 600000, 'user', 'Test', ?)").bind(user.id, user.email, now).run();
await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)").bind(user.tenantId, user.id, now).run();
await database.prepare("INSERT INTO plans (id, code, name, price, currency, billing_period, included_tokens, limits_json, active, sort_order, created_at, updated_at) VALUES ('plan_safety_paid', 'safety-paid', 'Safety paid', 100, 'RUB', 'month', 0, '{}', 1, 10, ?, ?)").bind(now, now).run();
await database.prepare("INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES ('subscription_safety_paid', ?, 'plan_safety_paid', 'active', ?, ?, ?)").bind(user.id, now, now, now).run();
const session = await auth.createSession(user);
await billing.creditTokens({ userId: user.id, type: "correction", amount: 1_000_000, idempotencyKey: "safety-seed" });
await billing.updateGlobalSettings(user.id, { token_charging_enabled: true });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); });

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4bAAAAABJRU5ErkJggg==";
const pointEdit = { x: 50, y: 50, markedImage: png };
const globalEdit = { prompt: "Сделай стены светлее", roomImage: png, globalEdit: { instruction: "Сделай стены светлее" } };
const templateEdit = { operation: "global_edit", prompt: "[template:design-battle; output:Решение A]", roomImage: png, templateEdit: { templateId: "design-battle", instructions: "Создай решение A", outputLabel: "Решение A", referenceImages: [png, png] } };
const operations = [
  { name: "material", body: { operation: "material", prompt: "Измени материал", roomImage: png, referenceImage: png, pointEdit, material: { instruction: "Применить материал" } }, images: 3 },
  { name: "replace", body: { operation: "replace", prompt: "Замени диван", roomImage: png, referenceImage: png, pointEdit, replacement: { name: "диван" } }, images: 3 },
  { name: "remove", body: { operation: "remove", prompt: "Удали диван", roomImage: png, pointEdit, removal: { name: "диван" } }, images: 2 },
  { name: "place", body: { operation: "place", prompt: "Добавь кресло", roomImage: png, referenceImage: png, pointEdit, placement: { x: 50, y: 50 } }, images: 3 },
  { name: "global_edit", body: globalEdit, images: 1 },
  { name: "template_edit", body: templateEdit, images: 3 },
];
let nextId = 0;
const request = (body, id = `safety-${++nextId}`) => new Request("https://norr-club.testaimoblernorr.chatgpt.site/api/generate", { method: "POST", headers: { Cookie: `room_session=${session}`, "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify(body) });
const balance = async () => (await billing.getTokenAccount(user.id)).balance;
const transactions = async (id) => (await database.prepare("SELECT type FROM token_transactions WHERE reference_id = ? ORDER BY type").bind(id).all()).results.map((row) => row.type);
const generationCount = async (id) => Number((await database.prepare("SELECT COUNT(*) AS count FROM generations WHERE id = ?").bind(id).first()).count);

test("point-guided operations reject invalid images and points before reserve or provider", async () => {
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  const before = await balance();
  const material = operations[0].body;
  const cases = [
    { ...globalEdit, roomImage: undefined },
    { ...globalEdit, globalEdit: { instruction: " " } },
    { ...material, roomImage: "data:image/png;base64,bm90LWltYWdl" },
    { ...material, referenceImage: undefined },
    { ...material, referenceImage: "data:image/png;base64,bm90LWltYWdl" },
    { ...material, pointEdit: undefined },
    { ...material, pointEdit: { x: -1, y: 50, markedImage: png } },
    { ...material, pointEdit: { x: 50, y: 50, markedImage: "data:image/png;base64,bm90LWltYWdl" } },
  ];
  for (const body of cases) assert.equal((await POST(request(body))).status, 400);
  assert.equal(await balance(), before);
});

test("explicit material routing rejects Add, Replace and Remove payloads before reserve", async () => {
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  const before = await balance();
  const material = operations[0].body;
  for (const body of [{ ...material, placement: { x: 50, y: 50 } }, { ...material, replacement: { name: "диван" } }, { ...material, removal: { name: "диван" } }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal(await balance(), before);
});

test("all edit operations reject insufficient tokens without calling provider", async () => {
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  await database.prepare("UPDATE token_accounts SET balance = 0 WHERE user_id = ?").bind(user.id).run();
  for (const { body } of operations) assert.equal((await POST(request(body))).status, 402);
  await billing.creditTokens({ userId: user.id, type: "correction", amount: 1_000_000, idempotencyKey: "safety-reseed" });
});

test("provider error and timeout refund exactly once for every edit operation", async () => {
  for (const { name, body } of operations) {
    for (const failure of ["provider", "timeout"]) {
      const id = `failed-${name}-${failure}`;
      const before = await balance();
      globalThis.fetch = async (_url, options) => {
        assert.ok(options.signal, "provider request must have a timeout signal");
        if (failure === "timeout") throw new DOMException("Timed out", "TimeoutError");
        return Response.json({ error: { message: "Provider failed" } }, { status: 503 });
      };
      const response = await POST(request(body, id));
      assert.equal(response.status, failure === "timeout" ? 504 : 503);
      assert.equal(await balance(), before);
      assert.deepEqual(await transactions(id), ["generation", "refund"]);
      assert.equal(await generationCount(id), 0);
      assert.equal((await POST(request(body, id))).status, 409);
      assert.equal(await balance(), before);
    }
  }
});

test("success sends clean plus marked images, never a segmentation mask, and charges once", async () => {
  for (const { name, body, images } of operations) {
    const id = `success-${name}`;
    const before = await balance();
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls += 1;
      assert.equal(url, "https://api.openai.com/v1/images/edits");
      assert.ok(options.signal);
      assert.equal(options.body.getAll("image[]").length, images);
      assert.equal(options.body.get("mask"), null);
      const providerPrompt = String(options.body.get("prompt"));
      if (!["global_edit", "template_edit"].includes(name)) assert.match(providerPrompt, /temporary crosshair marker/);
      if (name === "material") assert.match(providerPrompt, /exclusively as a source of colour, material, texture/);
      if (name === "template_edit") assert.match(providerPrompt, /Images 2–3 are supporting references/);
      return Response.json({ data: [{ b64_json: png.split(",")[1] }], usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 } });
    };
    const generatedResponse = await POST(request(body, id));
    assert.equal(generatedResponse.status, 200);
    const operation = body.operation || name;
    const cost = (await billing.quoteAiOperation(operation)).tokenCost;
    assert.equal(generatedResponse.headers.get("X-Room-AI-Operation"), operation);
    assert.equal(generatedResponse.headers.get("X-Room-AI-Token-Cost"), String(cost));
    assert.equal(generatedResponse.headers.get("X-Room-AI-Charging"), "enabled");
    assert.equal(generatedResponse.headers.get("X-Room-AI-Input-Tokens"), "11");
    assert.equal(generatedResponse.headers.get("X-Room-AI-Output-Tokens"), "22");
    assert.equal(generatedResponse.headers.get("X-Room-AI-Total-Tokens"), "33");
    assert.equal(await balance(), before - cost);
    assert.deepEqual(await transactions(id), ["generation"]);
    assert.equal(await generationCount(id), 1);
    assert.equal((await POST(request(body, id))).status, 409);
    assert.equal(calls, 1);
    assert.equal(await balance(), before - cost);
  }
});

test("furniture casting sends every item in one provider request and stores one final generation", async () => {
  const id = "success-furniture-casting";
  const before = await balance();
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.body.getAll("image[]").length, 4);
    assert.equal(options.body.get("mask"), null);
    assert.match(String(options.body.get("prompt")), /all 2 supplied furniture items together in one coherent image/);
    assert.match(String(options.body.get("prompt")), /Image 3 is furniture item 1/);
    assert.match(String(options.body.get("prompt")), /Image 4 is furniture item 2/);
    return Response.json({ data: [{ b64_json: png.split(",")[1] }], usage: { input_tokens: 21, output_tokens: 22, total_tokens: 43 } });
  };
  const response = await POST(request({
    operation: "place",
    prompt: "Мебельный кастинг: единый результат [items:2; final:yes]",
    roomImage: png,
    furnitureCasting: {
      markedImage: png,
      items: [
        { x: 30, y: 55, name: "Кровать", referenceImage: png },
        { x: 70, y: 65, name: "Пуф", referenceImage: png },
      ],
    },
  }, id));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(await generationCount(id), 1);
  assert.deepEqual(await transactions(id), ["generation"]);
  assert.equal(await balance(), before - (await billing.quoteAiOperation("place")).tokenCost);
});
