import { randomUUID } from "node:crypto";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

const RETENTION_DAYS = 30;
const GENERATED_IMAGE_KEY = /^tenants\/[^/]+\/users\/[^/]+\/generations\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

if (!process.env.ROOM_DESIGN_DATA_DIR && !process.env.DATA_DIR && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const dataRoot = resolve(process.env.ROOM_DESIGN_DATA_DIR || process.env.DATA_DIR || "data");
const storageRoot = resolve(dataRoot, "storage");
const database = new DatabaseSync(resolve(dataRoot, "room-design.sqlite"));
database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");

const columns = new Set(database.prepare("PRAGMA table_info(generations)").all().map((column) => column.name));
if (!columns.has("image_deleted_at")) database.exec("ALTER TABLE generations ADD COLUMN image_deleted_at TEXT");
if (!columns.has("image_deletion_reason")) database.exec("ALTER TABLE generations ADD COLUMN image_deletion_reason TEXT");
database.exec(`
  CREATE TABLE IF NOT EXISTS storage_cleanup_runs (
    id TEXT PRIMARY KEY,
    cutoff_at TEXT NOT NULL,
    dry_run INTEGER NOT NULL,
    scanned INTEGER NOT NULL DEFAULT 0,
    eligible INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    missing INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    freed_bytes INTEGER NOT NULL DEFAULT 0,
    errors_json TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_generations_retention ON generations(image_deleted_at, created_at);
`);

const startedAt = new Date().toISOString();
const cutoffAt = new Date(Date.parse(startedAt) - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
const dryRun = !process.argv.includes("--execute");
const result = {
  id: randomUUID(), cutoffAt, dryRun, scanned: 0, eligible: 0, deleted: 0,
  missing: 0, failed: 0, freedBytes: 0, skippedProtected: 0, skippedIneligible: 0, errors: [],
};

const candidates = database.prepare(`
  SELECT id, output_key, content_type, created_at
  FROM generations
  WHERE created_at < ? AND image_deleted_at IS NULL
  ORDER BY created_at ASC
`).all(cutoffAt);
result.scanned = candidates.length;

const markDeleted = database.prepare(`
  UPDATE generations
  SET image_deleted_at = ?, image_deletion_reason = ?
  WHERE id = ? AND image_deleted_at IS NULL
`);

for (const candidate of candidates) {
  if (candidate.content_type !== "image/webp" || !GENERATED_IMAGE_KEY.test(candidate.output_key)) {
    result.skippedIneligible += 1;
    continue;
  }
  result.eligible += 1;
  if (dryRun) continue;

  try {
    const target = resolve(storageRoot, ...candidate.output_key.split("/").filter(Boolean));
    if (!target.startsWith(`${storageRoot}${sep}`)) throw new Error("Некорректный ключ файла.");

    let size = 0;
    let deleted = false;
    try {
      size = statSync(target).size;
      unlinkSync(target);
      deleted = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      unlinkSync(`${target}.metadata.json`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    if (deleted) {
      result.deleted += 1;
      result.freedBytes += size;
      markDeleted.run(startedAt, "retention_30_days", candidate.id);
    } else {
      result.missing += 1;
      markDeleted.run(startedAt, "missing_before_cleanup", candidate.id);
    }
  } catch (error) {
    result.failed += 1;
    result.errors.push({
      generationId: candidate.id,
      error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    });
  }
}

const completedAt = new Date().toISOString();
database.prepare(`
  INSERT INTO storage_cleanup_runs
    (id, cutoff_at, dry_run, scanned, eligible, deleted, missing, failed, freed_bytes, errors_json, started_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  result.id, cutoffAt, dryRun ? 1 : 0, result.scanned, result.eligible, result.deleted,
  result.missing, result.failed, result.freedBytes, JSON.stringify(result.errors), startedAt, completedAt,
);
database.close();

console.log(JSON.stringify({ ...result, completedAt }, null, 2));
if (result.failed > 0) process.exitCode = 1;
