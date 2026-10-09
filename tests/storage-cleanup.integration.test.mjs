import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataRoot = mkdtempSync(join(tmpdir(), "room-design-storage-cleanup-"));
process.env.ROOM_DESIGN_DATA_DIR = dataRoot;

const { ensureStore, storage } = await import("../lib/auth.ts");
const { database } = await import("../lib/server-runtime.ts");
const { runStorageCleanup } = await import("../lib/storage-cleanup.ts");
const { isEligibleGenerationOutput } = await import("../lib/storage-policy.ts");

after(() => rmSync(dataRoot, { recursive: true, force: true }));

test("storage cleanup deletes only canonical expired generated images and preserves accounting", async () => {
  await ensureStore();
  const userId = "retention-test-user";
  const tenantId = "tenant_norrmobler";
  const tenantSlug = "norrmobler";
  const oldDate = "2026-01-01T12:00:00.000Z";
  const recentDate = "2026-09-25T12:00:00.000Z";
  const now = new Date("2026-10-09T12:00:00.000Z");

  await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, created_at) VALUES (?, ?, 'hash', 'salt', 'pbkdf2-sha256', 600000, 'user', ?)")
    .bind(userId, "retention@example.test", oldDate).run();
  await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
    .bind(tenantId, userId, oldDate).run();

  const ids = {
    eligible: "2b8ff1c9-43de-4b3c-b472-c15dbd09ec10",
    recent: "fbd62c0d-2407-46fc-a820-b251833e725d",
    projectPath: "ac099c93-cc32-4c11-99a8-f121ed712785",
    referencePath: "89637c68-04fc-4f11-8747-826ec292c62f",
    legacyPath: "e90f8f32-8809-4ddc-b5c6-711f26cf544a",
    protected: "cbe82f3d-fddd-4a5a-8bf3-bbdfcfd3a0a9",
  };
  const keys = {
    eligible: `tenants/${tenantSlug}/users/${userId}/generations/2026-01-01/${ids.eligible}.webp`,
    recent: `tenants/${tenantSlug}/users/${userId}/generations/2026-09-25/${ids.recent}.webp`,
    projectPath: `tenants/${tenantSlug}/users/${userId}/projects/project-1/source.webp`,
    referencePath: `tenants/${tenantSlug}/users/${userId}/template-assets/files/reference.webp`,
    legacyPath: `legacy/generations/${ids.legacyPath}.webp`,
    protected: `tenants/${tenantSlug}/users/${userId}/generations/2026-01-01/${ids.protected}.webp`,
  };
  const bytes = new TextEncoder().encode("generated-image-test");
  for (const key of Object.values(keys)) await storage().put(key, bytes, { httpMetadata: { contentType: "image/webp" } });

  const insertGeneration = async (id, key, createdAt, tokenCost = 37) => database.prepare("INSERT INTO generations (id, user_id, tenant_id, operation, prompt, output_key, content_type, bytes, input_tokens, output_tokens, total_tokens, token_cost, brutto_coefficient_snapshot, created_at) VALUES (?, ?, ?, 'generate', 'retention test', ?, 'image/webp', ?, 11, 13, 24, ?, 2.2, ?)")
    .bind(id, userId, tenantId, key, bytes.byteLength, tokenCost, createdAt).run();

  await insertGeneration(ids.eligible, keys.eligible, oldDate, 91);
  await insertGeneration(ids.recent, keys.recent, recentDate);
  await insertGeneration(ids.projectPath, keys.projectPath, oldDate);
  await insertGeneration(ids.referencePath, keys.referencePath, oldDate);
  await insertGeneration(ids.legacyPath, keys.legacyPath, oldDate);
  await insertGeneration(ids.protected, keys.protected, oldDate);
  await database.prepare("INSERT INTO projects (id, user_id, tenant_id, name, state_json, created_at, updated_at) VALUES ('project-1', ?, ?, 'Protected source', ?, ?, ?)")
    .bind(userId, tenantId, JSON.stringify({ sourceGenerationId: ids.protected, sourceKey: keys.protected }), oldDate, oldDate).run();

  assert.equal(isEligibleGenerationOutput({ output_key: keys.eligible, content_type: "image/webp" }), true);
  assert.equal(isEligibleGenerationOutput({ output_key: keys.projectPath, content_type: "image/webp" }), false);
  assert.equal(isEligibleGenerationOutput({ output_key: keys.eligible, content_type: "image/png" }), false);

  const dryRun = await runStorageCleanup({ now, dryRun: true });
  assert.deepEqual({ scanned: dryRun.scanned, eligible: dryRun.eligible, deleted: dryRun.deleted, protected: dryRun.skippedProtected, ineligible: dryRun.skippedIneligible }, { scanned: 5, eligible: 1, deleted: 0, protected: 1, ineligible: 3 });
  assert.ok(await storage().get(keys.eligible), "dry run must not delete the eligible image");

  const executed = await runStorageCleanup({ now, dryRun: false });
  assert.deepEqual({ scanned: executed.scanned, eligible: executed.eligible, deleted: executed.deleted, missing: executed.missing, failed: executed.failed, protected: executed.skippedProtected, ineligible: executed.skippedIneligible }, { scanned: 5, eligible: 1, deleted: 1, missing: 0, failed: 0, protected: 1, ineligible: 3 });
  assert.equal(executed.freedBytes, bytes.byteLength);
  assert.equal(await storage().get(keys.eligible), null, "expired generated image must be physically deleted");
  assert.ok(await storage().get(keys.recent), "recent generated image must remain");
  assert.ok(await storage().get(keys.projectPath), "project image must remain");
  assert.ok(await storage().get(keys.referencePath), "reference image must remain");
  assert.ok(await storage().get(keys.legacyPath), "unclassified legacy path must remain");
  assert.ok(await storage().get(keys.protected), "project source must remain");

  const preserved = await database.prepare("SELECT input_tokens, output_tokens, total_tokens, token_cost, brutto_coefficient_snapshot, image_deleted_at, image_deletion_reason FROM generations WHERE id = ?")
    .bind(ids.eligible).first();
  assert.equal(preserved.input_tokens, 11);
  assert.equal(preserved.output_tokens, 13);
  assert.equal(preserved.total_tokens, 24);
  assert.equal(preserved.token_cost, 91);
  assert.equal(preserved.brutto_coefficient_snapshot, 2.2);
  assert.equal(preserved.image_deleted_at, now.toISOString());
  assert.equal(preserved.image_deletion_reason, "retention_30_days");

  const runs = await database.prepare("SELECT dry_run, scanned, eligible, deleted, failed, freed_bytes FROM storage_cleanup_runs ORDER BY started_at, dry_run DESC").all();
  assert.equal(runs.results.length, 2);
  assert.equal(runs.results.some((run) => Number(run.dry_run) === 1 && Number(run.deleted) === 0), true);
  assert.equal(runs.results.some((run) => Number(run.dry_run) === 0 && Number(run.deleted) === 1 && Number(run.freed_bytes) === bytes.byteLength), true);
});
