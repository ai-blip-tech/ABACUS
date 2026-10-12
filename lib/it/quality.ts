import { database } from "../server-runtime.ts";
import type { ItToolTrace, ItVisionAnalysis } from "./types.ts";

export type OnoQualityEvent = {
  requestId: string;
  tenantId: string;
  siteId: string;
  status: "succeeded" | "failed";
  requestKind: "test" | "real";
  imagePresent: boolean;
  firstResponseMs: number | null;
  durationMs: number;
  modelCalls: number;
  toolTrace: ItToolTrace[];
  productCount: number;
  handoffRequested: boolean;
  visionConfidence: ItVisionAnalysis["confidence"] | null;
  visionRequiresConfirmation: boolean;
  webSearchEnabled: boolean;
};

let setupPromise: Promise<void> | null = null;

export function ensureOnoQualityStore() {
  if (setupPromise) return setupPromise;
  setupPromise = database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS ono_quality_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      status TEXT NOT NULL,
      request_kind TEXT NOT NULL DEFAULT 'real',
      image_present INTEGER NOT NULL DEFAULT 0,
      first_response_ms INTEGER,
      duration_ms INTEGER NOT NULL,
      model_calls INTEGER NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      successful_tool_calls INTEGER NOT NULL DEFAULT 0,
      failed_tool_calls INTEGER NOT NULL DEFAULT 0,
      catalog_searches INTEGER NOT NULL DEFAULT 0,
      catalog_results INTEGER NOT NULL DEFAULT 0,
      knowledge_searches INTEGER NOT NULL DEFAULT 0,
      knowledge_results INTEGER NOT NULL DEFAULT 0,
      product_count INTEGER NOT NULL DEFAULT 0,
      handoff_requested INTEGER NOT NULL DEFAULT 0,
      vision_confidence TEXT,
      vision_requires_confirmation INTEGER NOT NULL DEFAULT 0,
      web_search_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_quality_tenant_created ON ono_quality_events(tenant_id, created_at DESC)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_quality_site_created ON ono_quality_events(site_id, created_at DESC)"),
  ]).then(async () => {
    const columns = await database.prepare("PRAGMA table_info(ono_quality_events)").all<{ name: string }>();
    const names = new Set(columns.results.map((column) => column.name));
    if (!names.has("request_kind")) await database.prepare("ALTER TABLE ono_quality_events ADD COLUMN request_kind TEXT NOT NULL DEFAULT 'real'").run();
    if (!names.has("first_response_ms")) await database.prepare("ALTER TABLE ono_quality_events ADD COLUMN first_response_ms INTEGER").run();
  });
  return setupPromise;
}

export function summarizeOnoQuality(input: Pick<OnoQualityEvent, "toolTrace">) {
  const trace = input.toolTrace;
  const successful = trace.filter((item) => item.status === "success");
  return {
    toolCalls: trace.length,
    successfulToolCalls: successful.length,
    failedToolCalls: trace.length - successful.length,
    catalogSearches: trace.filter((item) => item.name === "search_catalog").length,
    catalogResults: trace.filter((item) => item.name === "search_catalog" && item.status === "success").reduce((total, item) => total + item.resultCount, 0),
    knowledgeSearches: trace.filter((item) => item.name === "knowledge_search").length,
    knowledgeResults: trace.filter((item) => item.name === "knowledge_search" && item.status === "success").reduce((total, item) => total + item.resultCount, 0),
  };
}

export async function recordOnoQualityEvent(input: OnoQualityEvent) {
  await ensureOnoQualityStore();
  const summary = summarizeOnoQuality(input);
  await database.prepare(`INSERT OR REPLACE INTO ono_quality_events (
    id, request_id, tenant_id, site_id, status, request_kind, image_present, first_response_ms, duration_ms, model_calls,
    tool_calls, successful_tool_calls, failed_tool_calls, catalog_searches, catalog_results,
    knowledge_searches, knowledge_results, product_count, handoff_requested, vision_confidence,
    vision_requires_confirmation, web_search_enabled, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), input.requestId, input.tenantId, input.siteId, input.status,
      input.requestKind, input.imagePresent ? 1 : 0,
      input.firstResponseMs === null ? null : Math.max(0, Math.round(input.firstResponseMs)),
      Math.max(0, Math.round(input.durationMs)), Math.max(0, Math.round(input.modelCalls)),
      summary.toolCalls, summary.successfulToolCalls, summary.failedToolCalls,
      summary.catalogSearches, summary.catalogResults, summary.knowledgeSearches, summary.knowledgeResults,
      Math.max(0, Math.round(input.productCount)), input.handoffRequested ? 1 : 0,
      input.visionConfidence, input.visionRequiresConfirmation ? 1 : 0,
      input.webSearchEnabled ? 1 : 0, new Date().toISOString(),
    ).run();
  console.info("[ono-quality]", JSON.stringify({
    requestId: input.requestId,
    tenantId: input.tenantId,
    siteId: input.siteId,
    status: input.status,
    requestKind: input.requestKind,
    imagePresent: input.imagePresent,
    firstResponseMs: input.firstResponseMs,
    durationMs: input.durationMs,
    modelCalls: input.modelCalls,
    productCount: input.productCount,
    visionConfidence: input.visionConfidence,
    ...summary,
  }));
  return summary;
}

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
};

export async function onoQualitySummary(input: { tenantId: string; requestKind: "test" | "real"; since?: string }) {
  await ensureOnoQualityStore();
  const rows = await database.prepare(`SELECT duration_ms, first_response_ms, status, tool_calls,
    catalog_searches, catalog_results, product_count, handoff_requested
    FROM ono_quality_events WHERE tenant_id = ? AND request_kind = ? AND created_at >= ?`)
    .bind(input.tenantId, input.requestKind, input.since || "1970-01-01T00:00:00.000Z")
    .all<Record<string, number | string | null>>();
  const durations = rows.results.map((row) => Number(row.duration_ms)).filter(Number.isFinite);
  const firstResponses = rows.results.filter((row) => row.first_response_ms !== null).map((row) => Number(row.first_response_ms)).filter((value) => Number.isFinite(value) && value >= 0);
  const total = rows.results.length;
  const successfulSearches = rows.results.filter((row) => Number(row.catalog_searches) > 0 && Number(row.catalog_results) > 0).length;
  return {
    requestKind: input.requestKind,
    total,
    p50DurationMs: percentile(durations, .5),
    p95DurationMs: percentile(durations, .95),
    p50FirstResponseMs: percentile(firstResponses, .5),
    p95FirstResponseMs: percentile(firstResponses, .95),
    errorRate: total ? rows.results.filter((row) => row.status !== "succeeded").length / total : 0,
    averageToolCalls: total ? rows.results.reduce((sum, row) => sum + Number(row.tool_calls), 0) / total : 0,
    searchSuccessRate: total ? successfulSearches / total : 0,
    productResponseRate: total ? rows.results.filter((row) => Number(row.product_count) > 0).length / total : 0,
    handoffRate: total ? rows.results.filter((row) => Number(row.handoff_requested) > 0).length / total : 0,
  };
}
