import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "room-design-admin-users-report-"));
process.env.ROOM_DESIGN_DATA_DIR = dataDir;
process.env.ROOM_DESIGN_BUSINESS_TIMEZONE = "Europe/Moscow";

const { ensureStore } = await import("../lib/auth.ts");
const { ensureBillingStore } = await import("../lib/billing.ts");
const { ensureAiCostLedgerStore } = await import("../lib/ai-cost-ledger.ts");
const { resolveAdminUsersFilter, adminUsersReport } = await import("../lib/admin-users-report.ts");
const { createAdminUsersXlsx } = await import("../lib/admin-users-xlsx.ts");
const { dateRangeUtc } = await import("../lib/business-time.ts");
const { database } = await import("../lib/server-runtime.ts");

await ensureStore();
await ensureBillingStore();
await ensureAiCostLedgerStore();

const now = "2026-10-01T00:00:00.000Z";
for (const [id, slug, name] of [["tenant-norr", "norr", "NORR Møbler"], ["tenant-other", "other", "Other Tenant"]]) {
  await database.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").bind(id, slug, name, now, now).run();
}
for (const [id, email, firstName] of [["user-a", "a@example.com", "User A"], ["user-b", "b@example.com", "User B"], ["user-c", "c@example.com", "User C"]]) {
  await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, first_name, created_at) VALUES (?, ?, 'hash', 'salt', ?, ?)").bind(id, email, firstName, now).run();
}
await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES ('tenant-norr', 'user-a', 'member', ?), ('tenant-norr', 'user-b', 'member', ?), ('tenant-other', 'user-c', 'member', ?)").bind(now, now, now).run();
await database.prepare(`INSERT INTO projects (id, user_id, tenant_id, name, created_at, updated_at) VALUES
  ('project-a-period', 'user-a', 'tenant-norr', 'A period', '2026-10-02T10:00:00.000Z', '2026-10-02T10:00:00.000Z'),
  ('project-a-old', 'user-a', 'tenant-norr', 'A old', '2026-08-02T10:00:00.000Z', '2026-10-02T10:00:00.000Z'),
  ('project-b-period', 'user-b', 'tenant-norr', 'B period', '2026-10-07T10:00:00.000Z', '2026-10-07T10:00:00.000Z')`).run();
await database.prepare(`INSERT INTO generations (
  id, user_id, tenant_id, operation, prompt, output_key, content_type, input_tokens, output_tokens, total_tokens, brutto_coefficient_snapshot, created_at
) VALUES
  ('generation-a-period', 'user-a', 'tenant-norr', 'generate', '', 'a-period.webp', 'image/webp', 100, 200, 300, 2.2, '2026-10-02T10:00:00.000Z'),
  ('generation-a-old', 'user-a', 'tenant-norr', 'generate', '', 'a-old.webp', 'image/webp', 999, 999, 1998, 2.2, '2026-08-02T10:00:00.000Z'),
  ('generation-b-period', 'user-b', 'tenant-norr', 'generate', '', 'b-period.webp', 'image/webp', 50, 50, 100, NULL, '2026-10-07T10:00:00.000Z')`).run();

async function ledger(id, userId, tenantId, createdAt, rdTokens, net, gross, coefficient = 2) {
  await database.prepare(`INSERT INTO ai_cost_ledger (
    id, request_id, user_id, tenant_id, operation_type, provider, model, endpoint, status,
    rd_tokens_charged, rd_tokens_quoted, input_text_tokens, input_image_tokens, output_image_tokens,
    net_micro_usd, gross_coefficient_snapshot, gross_micro_usd, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'render', 'openai', 'model', 'endpoint', 'succeeded', ?, ?, 1, 2, 3, ?, ?, ?, ?, ?)`)
    .bind(id, `request-${id}`, userId, tenantId, rdTokens, rdTokens, net, coefficient, gross, createdAt, createdAt).run();
}

await ledger("a-1", "user-a", "tenant-norr", "2026-10-01T10:00:00.000Z", 10, 100, 200);
await ledger("a-5", "user-a", "tenant-norr", "2026-10-05T10:00:00.000Z", 20, 200, 400);
await ledger("a-12", "user-a", "tenant-norr", "2026-10-12T10:00:00.000Z", 40, 400, 800);
await ledger("b-7", "user-b", "tenant-norr", "2026-10-07T10:00:00.000Z", 30, 300, 750, 2.5);
await ledger("c-6", "user-c", "tenant-other", "2026-10-06T10:00:00.000Z", 50, 500, 1000);

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

test("business period uses Moscow start-of-day and includes the entire Date To", () => {
  assert.deepEqual(dateRangeUtc("2026-10-01", "2026-10-10", "Europe/Moscow"), {
    from: "2026-09-30T21:00:00.000Z",
    toExclusive: "2026-10-10T21:00:00.000Z",
  });
});

test("tenant and date filters aggregate only matching immutable ledger entries", async () => {
  const filter = resolveAdminUsersFilter(new URL("http://localhost/admin?tenant=tenant-norr&from=2026-10-01&to=2026-10-10"));
  const report = await adminUsersReport(filter);
  assert.deepEqual(report.users.map((user) => user.id).sort(), ["user-a", "user-b"]);
  const userA = report.users.find((user) => user.id === "user-a");
  const userB = report.users.find((user) => user.id === "user-b");
  assert.equal(userA?.ai_operation_count, 2);
  assert.equal(userA?.project_count, 1);
  assert.equal(userA?.generation_count, 1);
  assert.equal(userA?.legacy_net_estimate_micro_usd, 6800);
  assert.equal(userA?.legacy_gross_estimate_micro_usd, 14960);
  assert.equal(userA?.ai_rd_tokens_charged, 30);
  assert.equal(userB?.ai_operation_count, 1);
  assert.equal(userB?.project_count, 1);
  assert.equal(userB?.generation_count, 1);
  assert.equal(report.totals.project_count, 2);
  assert.equal(report.totals.generation_count, 2);
  assert.equal(report.totals.legacy_estimated_count, 2);
  assert.equal(report.totals.legacy_gross_estimated_count, 1);
  assert.equal(report.totals.ai_operation_count, 3);
  assert.equal(report.totals.ai_rd_tokens_charged, 60);
  assert.equal(report.totals.ai_net_micro_usd, 600);
  assert.equal(report.totals.ai_gross_micro_usd, 1350);
  assert.equal(report.grossCoefficient.variants, 2);
});

test("Excel export contains the same filters, rows and saved GROSS total", async () => {
  const filter = resolveAdminUsersFilter(new URL("http://localhost/admin?tenant=tenant-norr&from=2026-10-01&to=2026-10-10"));
  const report = await adminUsersReport(filter);
  const xlsx = await createAdminUsersXlsx(report, "NORR Møbler");
  assert.ok(xlsx.byteLength > 3000);
  const JSZip = (await import("jszip")).default;
  const archive = await JSZip.loadAsync(xlsx);
  const sheet = await archive.file("xl/worksheets/sheet1.xml")?.async("string");
  assert.match(sheet || "", /NORR Møbler/);
  assert.match(sheet || "", /2026-10-01 — 2026-10-10/);
  assert.match(sheet || "", /<v>0\.00135<\/v>/);
  assert.ok((sheet || "").indexOf("<autoFilter") < (sheet || "").indexOf("<mergeCells"));
  assert.doesNotMatch(sheet || "", /Legacy/);
});
