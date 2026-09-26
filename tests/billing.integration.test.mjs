import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const root = await mkdtemp(join(tmpdir(), "room-design-billing-test-"));
process.env.ROOM_DESIGN_DATA_DIR = root;
const auth = await import("../lib/auth.ts");
const billing = await import("../lib/billing.ts");
const payments = await import("../lib/payments.ts");
const google = await import("../lib/google-auth.ts");
const { database } = await import("../lib/server-runtime.ts");
await auth.ensureStore();

const now = new Date().toISOString();
async function user(id, email, globalRole = "user") {
  await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, first_name, created_at) VALUES (?, ?, 'x', 'x', 'google-only', 600000, ?, 'Test', ?)").bind(id, email, globalRole, now).run();
}
await user("source", "source@example.test", "admin");
await user("target", "target@example.test");
after(async () => rm(root, { recursive: true, force: true }));

test("token ledger creates accounts, credits, debits and rejects insufficient balance", async () => {
  assert.equal((await billing.getTokenAccount("source")).balance, 0);
  await billing.creditTokens({ userId: "source", type: "correction", amount: 1_000_000, description: "Test fixture", idempotencyKey: "seed-source" });
  await billing.debitTokens({ userId: "source", type: "generation", amount: 100, idempotencyKey: "debit-source" });
  assert.equal((await billing.getTokenAccount("source")).balance, 999_900);
  await assert.rejects(billing.debitTokens({ userId: "target", type: "generation", amount: 1, idempotencyKey: "insufficient" }), /Недостаточно/);
});

test("transfer is atomic, audited and idempotent", async () => {
  const input = { sourceUserId: "source", targetUserId: "target", amount: 50_000, adminUserId: "source", reason: "Manager testing", idempotencyKey: "transfer-1" };
  const first = await billing.transferTokens(input);
  const duplicate = await billing.transferTokens(input);
  assert.equal(first.id, duplicate.id);
  assert.equal((await billing.getTokenAccount("source")).balance, 949_900);
  assert.equal((await billing.getTokenAccount("target")).balance, 50_000);
  const rows = await database.prepare("SELECT type, initiated_by_admin_id, source_user_id, target_user_id FROM token_transactions WHERE reference_id = ? ORDER BY type").bind(first.id).all();
  assert.equal(rows.results.length, 2);
  assert.ok(rows.results.every((row) => row.initiated_by_admin_id === "source" && row.source_user_id === "source" && row.target_user_id === "target"));
  await assert.rejects(billing.transferTokens({ ...input, amount: 2_000_000, idempotencyKey: "transfer-2" }), /Недостаточно/);
  assert.equal((await billing.getTokenAccount("target")).balance, 50_000);
});

test("exchange rate and brutto changes affect new quotes while snapshots remain historical", async () => {
  assert.equal((await billing.quoteTokenPurchase(1000)).tokenAmount, 401_000);
  const oldAi = await billing.quoteAiOperation("generate");
  await billing.updateGlobalSettings("source", { token_exchange_rate: 420, brutto_coefficient: 3 });
  assert.equal((await billing.quoteTokenPurchase(1000)).tokenAmount, 420_000);
  const newAi = await billing.quoteAiOperation("generate");
  assert.ok(newAi.tokenCost > oldAi.tokenCost);
  assert.equal(oldAi.bruttoCoefficient, 2.2);
  assert.equal(newAi.bruttoCoefficient, 3);
});

test("failed AI operation refund and duplicate protection preserve balance", async () => {
  await billing.updateGlobalSettings("source", { token_charging_enabled: true });
  const before = (await billing.getTokenAccount("target")).balance;
  const reserved = await billing.reserveAiTokens("target", "generate", "failed-op", "reserve-failed-op");
  await billing.refundAiTokens("target", "failed-op", reserved.quote.tokenCost, "technical failure");
  await billing.refundAiTokens("target", "failed-op", reserved.quote.tokenCost, "duplicate retry");
  assert.equal((await billing.getTokenAccount("target")).balance, before);
});

test("Google identity creates once and links by verified normalized email", async () => {
  const created = await google.resolveGoogleIdentity({ sub: "google-new", email: " New@Example.Test ", given_name: "New" });
  assert.equal(created, await google.resolveGoogleIdentity({ sub: "google-new", email: "new@example.test" }));
  await user("existing", "existing@example.test");
  const linked = await google.resolveGoogleIdentity({ sub: "google-existing", email: "EXISTING@example.test" });
  assert.equal(linked, "existing");
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM users WHERE email IN ('new@example.test', 'existing@example.test')").first()).count, 2);
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE user_id IN (?, ?)").bind(created, linked).first()).count, 0);
});

test("payment keeps rate snapshot and paid webhook credits exactly once", async () => {
  const payment = await payments.createTokenPayment({ userId: "target", rubles: 10, idempotencyKey: "payment-1" });
  assert.equal(payment.exchange_rate_snapshot, 420);
  assert.equal(payment.token_amount, 4200);
  const payload = JSON.stringify({ eventId: "event-1", paymentId: payment.id, status: "paid" });
  const before = (await billing.getTokenAccount("target")).balance;
  await payments.finalizePaymentWebhook("mock", payload);
  await payments.finalizePaymentWebhook("mock", payload);
  assert.equal((await billing.getTokenAccount("target")).balance, before + 4200);
  const failed = await payments.createTokenPayment({ userId: "target", rubles: 10, idempotencyKey: "payment-2" });
  await payments.finalizePaymentWebhook("mock", JSON.stringify({ eventId: "event-2", paymentId: failed.id, status: "failed" }));
  assert.equal((await billing.getTokenAccount("target")).balance, before + 4200);
});
