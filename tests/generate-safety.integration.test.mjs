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
const user = { id: "safety-user", email: "safety@example.test", role: "admin", tenantId: "tenant_norrmobler", tenantSlug: "norrmobler", tenantRole: "member", firstName: "Test", lastName: "", phone: "", companyRole: "" };
const now = new Date().toISOString();
await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, first_name, created_at) VALUES (?, ?, 'x', 'x', 'google-only', 600000, 'admin', 'Test', ?)").bind(user.id, user.email, now).run();
await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)").bind(user.tenantId, user.id, now).run();
const session = await auth.createSession(user);
await billing.creditTokens({ userId: user.id, type: "correction", amount: 1_000_000, idempotencyKey: "safety-seed" });
await billing.updateGlobalSettings(user.id, { token_charging_enabled: true });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); });

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4bAAAAABJRU5ErkJggg==";
const differentSizeMask = Buffer.from(png.split(",")[1], "base64");
differentSizeMask.writeUInt32BE(2, 16);
const globalEdit = { prompt: "Сделай стены светлее", roomImage: png, globalEdit: { instruction: "Сделай стены светлее" } };
const material = { prompt: "Измени материал", roomImage: png, referenceImage: png, material: { mask: png, instruction: "Применить материал" } };
let nextId = 0;
const request = (body, id = `safety-${++nextId}`) => new Request("http://localhost/api/generate", { method: "POST", headers: { Cookie: `room_session=${session}`, "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify(body) });
const balance = async () => (await billing.getTokenAccount(user.id)).balance;
const transactions = async (id) => (await database.prepare("SELECT type FROM token_transactions WHERE reference_id = ? ORDER BY type").bind(id).all()).results.map((row) => row.type);
const generationCount = async (id) => Number((await database.prepare("SELECT COUNT(*) AS count FROM generations WHERE id = ?").bind(id).first()).count);

test("global_edit and material reject missing/invalid inputs before reserve or provider", async () => {
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  const before = await balance();
  const cases = [
    { ...globalEdit, roomImage: undefined },
    { ...globalEdit, roomImage: "data:image/png;base64,bm90LWltYWdl" },
    { ...globalEdit, globalEdit: { instruction: " " } },
    { ...material, referenceImage: undefined },
    { ...material, referenceImage: "data:image/png;base64,bm90LWltYWdl" },
    { ...material, material: { mask: undefined } },
    { ...material, material: { mask: "data:image/jpeg;base64,/9j/AA==" } },
    { ...material, material: { mask: `data:image/png;base64,${differentSizeMask.toString("base64")}` } },
  ];
  for (const body of cases) assert.equal((await POST(request(body))).status, 400);
  assert.equal(await balance(), before);
});

test("both operations reject insufficient tokens without calling provider", async () => {
  globalThis.fetch = () => { throw new Error("Provider must not be called"); };
  await database.prepare("UPDATE token_accounts SET balance = 0 WHERE user_id = ?").bind(user.id).run();
  for (const body of [globalEdit, material]) assert.equal((await POST(request(body))).status, 402);
  await billing.creditTokens({ userId: user.id, type: "correction", amount: 1_000_000, idempotencyKey: "safety-reseed" });
});

test("provider error, timeout and response-read failure refund once for both operations", async () => {
  for (const body of [globalEdit, material]) {
    for (const failure of ["provider", "timeout", "read"]) {
      const id = `failed-${body.material ? "material" : "global"}-${failure}`;
      const before = await balance();
      globalThis.fetch = async (_url, options) => {
        assert.ok(options.signal, "provider request must have a timeout signal");
        if (failure === "timeout") throw new DOMException("Timed out", "TimeoutError");
        if (failure === "read") return { text: async () => { throw new Error("Stream failed"); } };
        return Response.json({ error: { message: "Provider failed" } }, { status: 503 });
      };
      const response = await POST(request(body, id));
      assert.equal(response.status, failure === "timeout" ? 504 : failure === "read" ? 502 : 503);
      assert.equal(await balance(), before);
      assert.deepEqual(await transactions(id), ["generation", "refund"]);
      assert.equal(await generationCount(id), 0);
      assert.equal((await POST(request(body, id))).status, 409);
      assert.equal(await balance(), before);
    }
  }
});

test("invalid provider image refunds once without persisting history", async () => {
  for (const body of [globalEdit, material]) {
    const id = `invalid-output-${body.material ? "material" : "global"}`;
    const before = await balance();
    globalThis.fetch = async () => Response.json({ data: [{ b64_json: "not-base64" }] });
    assert.equal((await POST(request(body, id))).status, 502);
    assert.equal(await balance(), before);
    assert.deepEqual(await transactions(id), ["generation", "refund"]);
    assert.equal(await generationCount(id), 0);
  }
});

test("success charges once, persists generation and duplicate request does not charge or call provider", async () => {
  for (const body of [globalEdit, material]) {
    const id = `success-${body.material ? "material" : "global"}`;
    const before = await balance();
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls += 1;
      assert.equal(url, "https://api.openai.com/v1/images/edits");
      assert.ok(options.signal);
      assert.equal(options.body.getAll("image[]").length, body.material ? 2 : 1);
      assert.equal(Boolean(options.body.get("mask")), Boolean(body.material));
      return Response.json({ data: [{ b64_json: png.split(",")[1] }] });
    };
    assert.equal((await POST(request(body, id))).status, 200);
    const cost = (await billing.quoteAiOperation(body.material ? "material" : "global_edit")).tokenCost;
    assert.equal(await balance(), before - cost);
    assert.deepEqual(await transactions(id), ["generation"]);
    assert.equal(await generationCount(id), 1);
    assert.equal((await POST(request(body, id))).status, 409);
    assert.equal(calls, 1);
    assert.equal(await balance(), before - cost);
  }
});
