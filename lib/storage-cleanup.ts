import { ensureStore, storage } from "./auth.ts";
import { database } from "./server-runtime.ts";
import { GENERATION_RETENTION_DAYS, isEligibleGenerationOutput } from "./storage-policy.ts";

type GenerationCandidate = {
  id: string;
  output_key: string;
  content_type: string;
  created_at: string;
};

export type StorageCleanupResult = {
  id: string;
  cutoffAt: string;
  dryRun: boolean;
  scanned: number;
  eligible: number;
  deleted: number;
  missing: number;
  failed: number;
  freedBytes: number;
  skippedProtected: number;
  skippedIneligible: number;
  errors: Array<{ generationId: string; error: string }>;
};

async function projectReferencesGeneration(row: GenerationCandidate) {
  const projects = await database.prepare("SELECT state_json FROM projects WHERE state_json IS NOT NULL AND (state_json LIKE ? OR state_json LIKE ?)")
    .bind(`%${row.id}%`, `%${row.output_key}%`)
    .all<{ state_json: string }>();
  return projects.results.some(({ state_json }) => state_json.includes(row.id) || state_json.includes(row.output_key));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}

export async function runStorageCleanup(options: { now?: Date; dryRun?: boolean } = {}): Promise<StorageCleanupResult> {
  await ensureStore();
  const startedAt = (options.now || new Date()).toISOString();
  const cutoffAt = new Date(new Date(startedAt).getTime() - GENERATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const dryRun = options.dryRun !== false;
  const run: StorageCleanupResult = {
    id: crypto.randomUUID(), cutoffAt, dryRun, scanned: 0, eligible: 0, deleted: 0,
    missing: 0, failed: 0, freedBytes: 0, skippedProtected: 0, skippedIneligible: 0, errors: [],
  };

  const candidates = await database.prepare("SELECT id, output_key, content_type, created_at FROM generations WHERE created_at < ? AND image_deleted_at IS NULL ORDER BY created_at ASC")
    .bind(cutoffAt)
    .all<GenerationCandidate>();
  run.scanned = candidates.results.length;

  for (const candidate of candidates.results) {
    if (!isEligibleGenerationOutput(candidate)) {
      run.skippedIneligible += 1;
      continue;
    }
    if (await projectReferencesGeneration(candidate)) {
      run.skippedProtected += 1;
      continue;
    }
    run.eligible += 1;
    if (dryRun) continue;
    try {
      const object = await storage().get(candidate.output_key);
      if (!object) {
        run.missing += 1;
        await database.prepare("UPDATE generations SET image_deleted_at = ?, image_deletion_reason = ? WHERE id = ? AND image_deleted_at IS NULL")
          .bind(startedAt, "missing_before_cleanup", candidate.id).run();
        continue;
      }
      const removed = await storage().delete(candidate.output_key);
      if (!removed.deleted) {
        run.missing += 1;
        await database.prepare("UPDATE generations SET image_deleted_at = ?, image_deletion_reason = ? WHERE id = ? AND image_deleted_at IS NULL")
          .bind(startedAt, "missing_during_cleanup", candidate.id).run();
        continue;
      }
      await database.prepare("UPDATE generations SET image_deleted_at = ?, image_deletion_reason = ? WHERE id = ? AND image_deleted_at IS NULL")
        .bind(startedAt, "retention_30_days", candidate.id).run();
      run.deleted += 1;
      run.freedBytes += removed.size;
    } catch (error) {
      run.failed += 1;
      run.errors.push({ generationId: candidate.id, error: errorMessage(error) });
    }
  }

  const completedAt = new Date().toISOString();
  await database.prepare("INSERT INTO storage_cleanup_runs (id, cutoff_at, dry_run, scanned, eligible, deleted, missing, failed, freed_bytes, errors_json, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(run.id, cutoffAt, dryRun ? 1 : 0, run.scanned, run.eligible, run.deleted, run.missing, run.failed, run.freedBytes, JSON.stringify(run.errors), startedAt, completedAt)
    .run();
  console.info(JSON.stringify({ event: "storage_cleanup", ...run, completedAt }));
  return run;
}
