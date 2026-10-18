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
const request = (body, id = `safety-${++nextId}`, headers = {}) => new Request("https://norr-club.testaimoblernorr.chatgpt.site/api/generate", { method: "POST", headers: { Cookie: `room_session=${session}`, "Content-Type": "application/json", "Idempotency-Key": id, ...headers }, body: JSON.stringify(body) });
const balance = async () => (await billing.getTokenAccount(user.id)).balance;
const transactions = async (id) => (await database.prepare("SELECT type FROM token_transactions WHERE reference_id = ? ORDER BY type").bind(id).all()).results.map((row) => row.type);
const generationCount = async (id) => Number((await database.prepare("SELECT COUNT(*) AS count FROM generations WHERE id = ?").bind(id).first()).count);
const lightingSet = (count, mode = "plan") => {
  const products = Array.from({ length: count }, (_, index) => ({ assetId: `asset-${mode}-${index + 1}`, productId: `product-${index + 1}`, name: `Product ${index + 1}`, article: `A-${index + 1}`, type: index ? "Светильник" : "Трек", quantity: 1 }));
  const referenceManifest = products.map((product) => ({ assetId: product.assetId, productId: product.productId, article: product.article, sourceKind: "user", source: png }));
  return { products, referenceManifest };
};

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

test("moodboard builder accepts sixteen equal image references in one provider request", async () => {
  const id = "success-moodboard-builder";
  const before = await balance();
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.body.getAll("image[]").length, 16);
    assert.equal(options.body.get("size"), "1024x1536");
    const providerPrompt = String(options.body.get("prompt"));
    assert.match(providerPrompt, /Images 1–16 are equal material and visual references/);
    assert.match(providerPrompt, /never substitute or invent a material/);
    assert.match(providerPrompt, /Do not create an interior room/);
    return Response.json({ data: [{ b64_json: png.split(",")[1] }], usage: { input_tokens: 41, output_tokens: 22, total_tokens: 63 } });
  };
  const response = await POST(request({
    operation: "global_edit",
    prompt: "[template:moodboard-to-room; output:Материальный мудборд] Собрать material moodboard",
    roomImage: png,
    outputSize: "1024x1536",
    templateEdit: {
      templateId: "moodboard-builder",
      instructions: "Собрать все материалы в одну editorial-композицию.",
      outputLabel: "Материальный мудборд",
      referenceImages: Array.from({ length: 15 }, () => png),
    },
  }, id));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(await generationCount(id), 1);
  assert.equal(await balance(), before - (await billing.quoteAiOperation("global_edit")).tokenCost);
});

test("moodboard builder rejects a seventeenth input before reserve or provider", async () => {
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  const before = await balance();
  const response = await POST(request({
    operation: "global_edit",
    prompt: "Слишком много материалов",
    roomImage: png,
    templateEdit: {
      templateId: "moodboard-builder",
      instructions: "Собрать мудборд.",
      outputLabel: "Материальный мудборд",
      referenceImages: Array.from({ length: 16 }, () => png),
    },
  }, "moodboard-too-many"));
  assert.equal(response.status, 400);
  assert.equal(await balance(), before);
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

test("technical-lighting plan uses its default idea and sends the plan plus product references", async () => {
  const id = "success-lighting-plan";
  const before = await balance();
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.ok(options.signal);
    assert.equal(options.body.getAll("image[]").length, 2);
    const providerPrompt = String(options.body.get("prompt"));
    assert.match(providerPrompt, /authoritative top-down technical ceiling lighting plan/);
    assert.match(providerPrompt, /3000 K/);
    assert.match(providerPrompt, /true night scene/);
    assert.match(providerPrompt, /strict non-rectangular polygon/);
    return Response.json({ data: [{ b64_json: png.split(",")[1] }], usage: { input_tokens: 31, output_tokens: 22, total_tokens: 53 } });
  };
  const response = await POST(request({
    operation: "plan_render",
    lightingPlan: {
      planImage: png,
      room: { width: 6000, length: 4500 },
      ceilingOutline: [
        { number: 1, xMm: 0, yMm: 0 },
        { number: 2, xMm: 6000, yMm: 0 },
        { number: 3, xMm: 6000, yMm: 4500 },
        { number: 4, xMm: 2500, yMm: 4500 },
        { number: 5, xMm: 2500, yMm: 2200 },
        { number: 6, xMm: 0, yMm: 2200 },
      ],
      referenceImages: [png],
      products: [{ name: "Трек 2 м", type: "track", widthMm: 35, lengthMm: 2000, source: "catalog" }],
      trackCount: 1,
      fixtureCount: 2,
      cctK: 3000,
      timeOfDay: "night",
    },
  }, id));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(await generationCount(id), 1);
  assert.deepEqual(await transactions(id), ["generation"]);
  assert.equal(await balance(), before - (await billing.quoteAiOperation("plan_render")).tokenCost);
});

test("technical-lighting retries one explicit provider 5xx", async () => {
  const id = "retry-lighting-file-load";
  const before = await balance();
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    if (calls === 1) return Response.json({ error: { message: "temporary provider failure" } }, { status: 503 });
    return Response.json({ data: [{ b64_json: png.split(",")[1] }], usage: { input_tokens: 31, output_tokens: 22, total_tokens: 53 } });
  };
  const response = await POST(request({
    operation: "plan_render",
    lightingPlan: {
      planImage: png,
      referenceImages: [png],
      products: [{ name: "Трек", type: "track", widthMm: 35, lengthMm: 2000, source: "catalog" }],
      trackCount: 1,
      fixtureCount: 0,
      cctK: 3000,
      timeOfDay: "day",
    },
  }, id));
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(await generationCount(id), 1);
  assert.equal(await balance(), before - (await billing.quoteAiOperation("plan_render")).tokenCost);
});

test("technical-lighting image correction uses the current image, overlay and generic default idea", async () => {
  const id = "success-lighting-edit";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.ok(options.signal);
    assert.equal(options.body.getAll("image[]").length, 3);
    const providerPrompt = String(options.body.get("prompt"));
    assert.match(providerPrompt, /temporary technical-lighting overlay/);
    assert.match(providerPrompt, /daytime exterior/);
    assert.doesNotMatch(providerPrompt, /GoMoon/i);
    return Response.json({ data: [{ b64_json: png.split(",")[1] }], usage: { input_tokens: 27, output_tokens: 22, total_tokens: 49 } });
  };
  const response = await POST(request({
    operation: "place",
    roomImage: png,
    lightingEdit: {
      overlayImage: png,
      referenceImages: [png],
      products: [{ name: "Точечный светильник", type: "fixture", widthMm: 80, lengthMm: 80, source: "catalog" }],
      trackCount: 0,
      fixtureCount: 1,
      cctK: 4000,
      timeOfDay: "day",
    },
  }, id));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(await generationCount(id), 1);
});

test("technical-lighting references require dimensions before token reservation", async () => {
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  const before = await balance();
  const response = await POST(request({
    operation: "plan_render",
    lightingPlan: {
      planImage: png,
      products: [{ name: "Референс трека", type: "track", source: "reference" }],
      trackCount: 1,
      fixtureCount: 0,
      cctK: 3000,
      timeOfDay: "day",
    },
  }, "lighting-reference-without-dimensions"));
  assert.equal(response.status, 400);
  assert.equal(await balance(), before);
});

test("mixed technical-lighting and furniture payload is rejected before provider while furniture remains unchanged", async () => {
  let calls = 0;
  const before = await balance();
  globalThis.fetch = async () => { calls += 1; return Response.json({ data: [{ b64_json: png.split(",")[1] }] }); };
  const mixed = await POST(request({ ...operations[0].body, technicalLighting: true }, "mixed-lighting-furniture"));
  assert.equal(mixed.status, 400);
  assert.match((await mixed.json()).error, /Нельзя объединять/);
  assert.equal(calls, 0);
  assert.equal(await balance(), before);
  assert.equal((await POST(request(operations[0].body, "ordinary-furniture-after-mixed"))).status, 200);
  assert.equal(calls, 1);
});

test("Sharp loading is isolated to technical lighting", async () => {
  process.env.ROOM_DESIGN_TECHNICAL_SHARP_DISABLED = "1";
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ data: [{ b64_json: png.split(",")[1] }] }); };
  try {
    assert.equal((await POST(request(globalEdit, "furniture-without-sharp"))).status, 200);
    const set = lightingSet(1, "sharp");
    const lighting = await POST(request({ technicalLighting: true, operation: "plan_render", lightingPlan: { planImage: png, ...set, trackCount: 1, fixtureCount: 0 } }, "lighting-without-sharp"));
    assert.equal(lighting.status, 400);
    assert.match((await lighting.json()).error, /технического света временно недоступен/);
    assert.equal(calls, 1);
  } finally { delete process.env.ROOM_DESIGN_TECHNICAL_SHARP_DISABLED; }
});

test("technical-lighting sends all 10 references and prompt indices match multipart order", async () => {
  for (const mode of ["plan", "edit"]) {
    const set = lightingSet(10, mode);
    const body = mode === "plan"
      ? { technicalLighting: true, operation: "plan_render", lightingPlan: { planImage: png, room: { width: 6000, length: 4500 }, ...set, trackCount: 1, fixtureCount: 9 } }
      : { technicalLighting: true, operation: "place", roomImage: png, lightingEdit: { overlayImage: png, ...set, trackCount: 1, fixtureCount: 9 } };
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.body.getAll("image[]").length, mode === "plan" ? 11 : 12);
      const prompt = String(options.body.get("prompt"));
      const firstIndex = mode === "plan" ? 2 : 3;
      for (let index = 0; index < 10; index += 1) assert.match(prompt, new RegExp(`asset-${mode}-${index + 1}[^;]+изображение ${firstIndex + index}`));
      return Response.json({ data: [{ b64_json: png.split(",")[1] }] });
    };
    assert.equal((await POST(request(body, `ten-refs-${mode}`))).status, 200);
  }
});

test("technical-lighting accepts exactly 16 total images and rejects 17 before charge", async () => {
  const accepted = lightingSet(15, "limit");
  globalThis.fetch = async (_url, options) => { assert.equal(options.body.getAll("image[]").length, 16); return Response.json({ data: [{ b64_json: png.split(",")[1] }] }); };
  assert.equal((await POST(request({ technicalLighting: true, operation: "plan_render", lightingPlan: { planImage: png, ...accepted, trackCount: 1, fixtureCount: 14 } }, "limit-16"))).status, 200);
  const before = await balance();
  const rejected = lightingSet(16, "over-limit");
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  const response = await POST(request({ technicalLighting: true, operation: "plan_render", lightingPlan: { planImage: png, ...rejected, trackCount: 1, fixtureCount: 15 } }, "limit-17"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /не более 15 референсов/);
  assert.equal(await balance(), before);
});

test("technical-lighting resolves a reopened tenant project asset", async () => {
  const projectId = "project-saved-123";
  const asset = "technical-reference-0";
  const bytes = Uint8Array.from(atob(png.split(",")[1]), (character) => character.charCodeAt(0));
  await auth.storage().put(`${auth.tenantStoragePrefix(user)}/projects/${projectId}/${asset}`, bytes, { httpMetadata: { contentType: "image/png" } });
  const set = { products: [{ assetId: "saved-asset", productId: "saved", name: "Saved", article: "S-1", type: "Светильник" }], referenceManifest: [{ assetId: "saved-asset", productId: "saved", article: "S-1", sourceKind: "project", source: `/api/projects/${projectId}/assets/${asset}` }] };
  globalThis.fetch = async (_url, options) => { assert.equal(options.body.getAll("image[]").length, 2); return Response.json({ data: [{ b64_json: png.split(",")[1] }] }); };
  assert.equal((await POST(request({ technicalLighting: true, operation: "plan_render", lightingPlan: { planImage: png, ...set, trackCount: 0, fixtureCount: 1 } }, "saved-project-asset"))).status, 200);
});

test("technical-lighting replays a completed result before reloading unavailable inputs", async () => {
  const id = "lighting-replay-before-inputs";
  const set = lightingSet(1, "replay");
  const body = { technicalLighting: true, operation: "plan_render", lightingPlan: { planImage: png, ...set, trackCount: 1, fixtureCount: 0 } };
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ data: [{ b64_json: png.split(",")[1] }] }); };
  assert.equal((await POST(request(body, id))).status, 200);
  const replay = await POST(request({ ...body, lightingPlan: { ...body.lightingPlan, planImage: "/api/projects/missing/assets/missing" } }, id));
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("x-generation-replayed"), "1");
  assert.equal(calls, 1);
});

test("technical-lighting control request disables retry and unknown outcomes never retry", async () => {
  const set = lightingSet(1, "no-retry");
  const body = { technicalLighting: true, operation: "plan_render", lightingPlan: { planImage: png, ...set, trackCount: 1, fixtureCount: 0 } };
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ error: { message: "temporary" } }, { status: 503 }); };
  assert.equal((await POST(request(body, "lighting-control-no-retry", { "X-Disable-Generation-Retry": "1" }))).status, 503);
  assert.equal(calls, 1);
  calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new TypeError("connection closed after upload"); };
  const unknown = await POST(request(body, "lighting-unknown-no-retry"));
  assert.equal(unknown.status, 400);
  assert.equal(calls, 1);
  assert.match((await unknown.json()).error, /дубликат/);
});
