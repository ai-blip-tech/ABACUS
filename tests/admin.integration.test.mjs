import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const root = await mkdtemp(join(tmpdir(), "room-design-admin-test-"));
process.env.ROOM_DESIGN_DATA_DIR = root;

const auth = await import("../lib/auth.ts");
const admin = await import("../lib/admin.ts");
const { adminGenerationThumbnail } = await import("../lib/admin-generation-image.ts");
const { database } = await import("../lib/server-runtime.ts");
await auth.ensureStore();

const now = new Date().toISOString();
async function insertUser(id, email, globalRole = "user", tenantRole = null) {
  await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, first_name, created_at) VALUES (?, ?, 'x', 'x', 'google-only', 600000, ?, 'Test', ?)").bind(id, email, globalRole, now).run();
  if (tenantRole) await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES ('tenant_norrmobler', ?, ?, ?)").bind(id, tenantRole, now).run();
}
await insertUser("global-admin", "global-admin@example.test", "admin");
await insertUser("ordinary", "ordinary@example.test", "user", "member");
await insertUser("tenant-admin", "tenant-admin@example.test", "user", "admin");

const userShape = (id, email, role, tenantRole) => ({ id, email, role, tenantId: "tenant_norrmobler", tenantSlug: "norrmobler", tenantRole, firstName: "Test", lastName: "", phone: "", companyRole: "" });
const globalToken = await auth.createSession(userShape("global-admin", "global-admin@example.test", "admin", null));
const ordinaryToken = await auth.createSession(userShape("ordinary", "ordinary@example.test", "user", "member"));
const tenantAdminToken = await auth.createSession(userShape("tenant-admin", "tenant-admin@example.test", "user", "admin"));
const request = (token) => new Request("https://norr-club.testaimoblernorr.chatgpt.site/admin", token ? { headers: { cookie: `room_session=${token}` } } : undefined);

after(async () => rm(root, { recursive: true, force: true }));

test("global admin authorization denies anonymous, ordinary and tenant admin sessions", async () => {
  assert.equal(await auth.requireGlobalAdmin(request()), null);
  assert.equal(await auth.requireGlobalAdmin(request(ordinaryToken)), null);
  assert.equal(await auth.requireGlobalAdmin(request(tenantAdminToken)), null);
  assert.equal((await auth.requireGlobalAdmin(request(globalToken)))?.id, "global-admin");
});

test("all global admin routes use strict global authorization", async () => {
  const routes = [
    "overview/route.ts", "users/route.ts", "users/[id]/route.ts", "users/[id]/generations/route.ts", "users/[id]/tokens/route.ts", "users/[id]/plan/route.ts", "users/[id]/tenant/route.ts",
    "plans/route.ts", "token-packages/route.ts", "payments/route.ts", "tenants/route.ts", "generations/route.ts",
    "generations/[id]/route.ts", "settings/route.ts", "token-transactions/route.ts", "tokens/transfer/route.ts", "audit-log/route.ts",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../app/api/admin/${route}`, import.meta.url), "utf8");
    assert.match(source, /requireGlobalAdmin/);
    assert.doesNotMatch(source, /requireAdmin\s*\(/);
  }
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireGlobalAdmin/);
  assert.match(page, /notFound\(\)/);
});

test("manual credit and debit preserve ledger balance and audit actor", async () => {
  await admin.adjustUserTokens({ adminUserId: "global-admin", userId: "ordinary", direction: "credit", amount: 500, reason: "Support credit", idempotencyKey: "credit-1" });
  await admin.adjustUserTokens({ adminUserId: "global-admin", userId: "ordinary", direction: "debit", amount: 125, reason: "Correction", idempotencyKey: "debit-1" });
  await admin.adjustUserTokens({ adminUserId: "global-admin", userId: "ordinary", direction: "credit", amount: 500, reason: "Duplicate", idempotencyKey: "credit-1" });
  const account = await database.prepare("SELECT balance FROM token_accounts WHERE user_id = 'ordinary'").first();
  const ledger = await database.prepare("SELECT COUNT(*) AS count FROM token_transactions WHERE user_id = 'ordinary'").first();
  const audit = await database.prepare("SELECT action, actor_user_id, entity_id FROM audit_logs WHERE entity_id = 'ordinary' ORDER BY created_at").all();
  assert.equal(account.balance, 375);
  assert.equal(ledger.count, 2);
  assert.deepEqual(audit.results.map((row) => row.action).sort(), ["tokens.credit", "tokens.debit"]);
  assert.ok(audit.results.every((row) => row.actor_user_id === "global-admin"));
});

test("plan assignment and user detail use existing billing entities", async () => {
  const subscription = await admin.assignUserPlan({ adminUserId: "global-admin", userId: "ordinary", planId: "plan_free" });
  assert.equal(subscription.plan_id, "plan_free");
  const detail = await admin.adminUserDetail("ordinary");
  assert.equal(detail.profile.email, "ordinary@example.test");
  assert.equal(detail.plan.code, "free");
  assert.equal(detail.memberships[0].role, "member");
  assert.equal(detail.account.balance, 375);
  const audit = await database.prepare("SELECT actor_user_id FROM audit_logs WHERE action = 'plan.assign' AND entity_id = 'ordinary'").first();
  assert.equal(audit.actor_user_id, "global-admin");
});

test("tenant assignment moves ordinary users, revokes sessions and keeps global admins tenantless", async () => {
  const moved = await admin.assignUserTenant({ adminUserId: "global-admin", userId: "ordinary", tenantId: "tenant_roomdesign" });
  assert.equal(moved.tenant.slug, "roomdesign");
  assert.equal(moved.sessionsRevoked, true);
  const memberships = await database.prepare("SELECT tenant_id, role FROM tenant_memberships WHERE user_id = 'ordinary'").all();
  assert.equal(memberships.results.length, 1);
  assert.equal(memberships.results[0].tenant_id, "tenant_roomdesign");
  assert.equal(memberships.results[0].role, "member");
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = 'ordinary'").first()).count, 0);
  await assert.rejects(() => admin.assignUserTenant({ adminUserId: "global-admin", userId: "global-admin", tenantId: "tenant_norrmobler" }), /Global admin/);
  await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES ('tenant_norrmobler', 'global-admin', 'member', ?)").bind(now).run();
  const cleared = await admin.assignUserTenant({ adminUserId: "global-admin", userId: "global-admin", tenantId: null });
  assert.equal(cleared.sessionsRevoked, false);
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE user_id = 'global-admin'").first()).count, 0);
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'tenant.assign' AND entity_id IN ('ordinary', 'global-admin')").first()).count, 2);
});

test("admin generation gallery pages records and creates compact thumbnails", async () => {
  const source = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#7c2630"/></svg>');
  const outputKey = "tenants/norrmobler/users/ordinary/generations/gallery-test.svg";
  await auth.storage().put(outputKey, source, { httpMetadata: { contentType: "image/svg+xml" } });
  await auth.recordGeneration(userShape("ordinary", "ordinary@example.test", "user", "member"), { id: "gallery-test", operation: "generate", prompt: "test", outputKey, contentType: "image/svg+xml", bytes: source.byteLength });

  const payload = await admin.adminUserGenerations("ordinary", 0, 24);
  assert.equal(payload.generations[0].id, "gallery-test");
  assert.equal(payload.total, 1);
  assert.equal(payload.nextOffset, null);
  assert.equal(await admin.adminUserGenerations("missing-user", 0, 24), null);
  const thumbnail = await adminGenerationThumbnail(source);
  assert.ok(thumbnail.byteLength > 0);
  assert.equal(thumbnail[0], 0x52);
  assert.equal(thumbnail[1], 0x49);
  assert.equal(thumbnail[2], 0x46);
  assert.equal(thumbnail[3], 0x46);
});

test("shared account dropdown exposes admin item only for global role", async () => {
  const source = await readFile(new URL("../app/account-dropdown.tsx", import.meta.url), "utf8");
  assert.match(source, /user\.role === "admin"/);
  assert.match(source, /Админ-панель/);
  assert.match(source, /href="\/admin"/);
});
