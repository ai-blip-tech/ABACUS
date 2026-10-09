import { database } from "./server-runtime.ts";

export type ImageProviderUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
};

type PricingSnapshot = {
  version: string;
  source: string;
  model: string;
  endpoint: string;
  cachedInputApplied: false;
  currency: "USD";
  unit: "per_million_tokens";
  inputTextUsd: number;
  inputImageUsd: number;
  outputImageUsd: number;
};

const CURRENT_IMAGE_PRICING: Record<string, Omit<PricingSnapshot, "model" | "endpoint">> = {
  "gpt-image-2.5-sunburst": {
    version: "openai-images-2026-10-10",
    source: "https://developers.openai.com/api/docs/guides/image-generation",
    cachedInputApplied: false,
    currency: "USD",
    unit: "per_million_tokens",
    inputTextUsd: 5,
    inputImageUsd: 8,
    outputImageUsd: 30,
  },
  "gpt-image-2.5-flare": {
    version: "openai-images-2026-10-10",
    source: "https://developers.openai.com/api/docs/guides/image-generation",
    cachedInputApplied: false,
    currency: "USD",
    unit: "per_million_tokens",
    inputTextUsd: 5,
    inputImageUsd: 8,
    outputImageUsd: 30,
  },
};

let setupPromise: Promise<void> | null = null;

export function ensureAiCostLedgerStore() {
  if (setupPromise) return setupPromise;
  setupPromise = database.prepare(`
    CREATE TABLE IF NOT EXISTS ai_cost_ledger (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      generation_id TEXT,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      project_id TEXT,
      operation_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_request_id TEXT,
      provider_http_status INTEGER,
      rd_tokens_charged INTEGER NOT NULL DEFAULT 0,
      rd_tokens_quoted INTEGER NOT NULL DEFAULT 0,
      input_text_tokens INTEGER,
      input_image_tokens INTEGER,
      output_text_tokens INTEGER,
      output_image_tokens INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      other_billing_units_json TEXT,
      usage_json TEXT,
      pricing_snapshot_json TEXT,
      net_micro_usd INTEGER,
      gross_coefficient_snapshot REAL NOT NULL,
      gross_micro_usd INTEGER,
      error_code TEXT,
      created_at TEXT NOT NULL,
      provider_completed_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE SET NULL
    )
  `).run().then(async () => {
    await database.batch([
      database.prepare("CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_created_at ON ai_cost_ledger(created_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_user_created ON ai_cost_ledger(user_id, created_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_tenant_created ON ai_cost_ledger(tenant_id, created_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_project ON ai_cost_ledger(project_id)"),
    ]);
  });
  return setupPromise;
}

const integerOrNull = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;

export function calculateImageProviderCost(model: string, endpoint: string, usage?: ImageProviderUsage, grossCoefficient = 1) {
  const base = CURRENT_IMAGE_PRICING[model];
  const textTokens = integerOrNull(usage?.input_tokens_details?.text_tokens);
  const imageTokens = integerOrNull(usage?.input_tokens_details?.image_tokens);
  const outputImageTokens = integerOrNull(usage?.output_tokens);
  const snapshot: PricingSnapshot | null = base ? { ...base, model, endpoint } : null;
  const exact = Boolean(snapshot && textTokens !== null && imageTokens !== null && outputImageTokens !== null);
  const netMicroUsd = exact && snapshot
    ? Math.round(textTokens! * snapshot.inputTextUsd + imageTokens! * snapshot.inputImageUsd + outputImageTokens! * snapshot.outputImageUsd)
    : null;
  return {
    pricingSnapshot: snapshot,
    netMicroUsd,
    grossMicroUsd: netMicroUsd === null ? null : Math.round(netMicroUsd * grossCoefficient),
    inputTextTokens: textTokens,
    inputImageTokens: imageTokens,
    outputTextTokens: 0,
    outputImageTokens,
    inputTokens: integerOrNull(usage?.input_tokens),
    outputTokens: outputImageTokens,
    totalTokens: integerOrNull(usage?.total_tokens),
  };
}

export async function aiCostLedgerHasRequest(requestId: string) {
  await ensureAiCostLedgerStore();
  return Boolean(await database.prepare("SELECT id FROM ai_cost_ledger WHERE request_id = ?").bind(requestId).first());
}

export async function createAiCostLedgerEntry(input: {
  requestId: string;
  userId: string;
  tenantId: string;
  projectId?: string | null;
  operationType: string;
  model: string;
  endpoint: string;
  rdTokensCharged: number;
  rdTokensQuoted: number;
  grossCoefficient: number;
}) {
  await ensureAiCostLedgerStore();
  const now = new Date().toISOString();
  await database.prepare(`
    INSERT INTO ai_cost_ledger (
      id, request_id, user_id, tenant_id, project_id, operation_type, provider, model, endpoint,
      status, rd_tokens_charged, rd_tokens_quoted, gross_coefficient_snapshot, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'openai', ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), input.requestId, input.userId, input.tenantId, input.projectId ?? null,
    input.operationType, input.model, input.endpoint, input.rdTokensCharged, input.rdTokensQuoted,
    input.grossCoefficient, now, now,
  ).run();
}

export async function recordAiProviderResult(input: {
  requestId: string;
  model: string;
  endpoint: string;
  grossCoefficient: number;
  providerRequestId?: string | null;
  providerHttpStatus?: number | null;
  usage?: ImageProviderUsage;
  status: string;
  errorCode?: string | null;
}) {
  await ensureAiCostLedgerStore();
  const now = new Date().toISOString();
  const cost = calculateImageProviderCost(input.model, input.endpoint, input.usage, input.grossCoefficient);
  await database.prepare(`
    UPDATE ai_cost_ledger SET
      status = ?, provider_request_id = ?, provider_http_status = ?,
      input_text_tokens = ?, input_image_tokens = ?, output_text_tokens = ?, output_image_tokens = ?,
      input_tokens = ?, output_tokens = ?, total_tokens = ?, usage_json = ?, pricing_snapshot_json = ?,
      net_micro_usd = ?, gross_micro_usd = ?, error_code = ?, provider_completed_at = ?, updated_at = ?
    WHERE request_id = ?
  `).bind(
    input.status, input.providerRequestId ?? null, input.providerHttpStatus ?? null,
    cost.inputTextTokens, cost.inputImageTokens, cost.outputTextTokens, cost.outputImageTokens,
    cost.inputTokens, cost.outputTokens, cost.totalTokens, input.usage ? JSON.stringify(input.usage) : null,
    cost.pricingSnapshot ? JSON.stringify(cost.pricingSnapshot) : null,
    cost.netMicroUsd, cost.grossMicroUsd, input.errorCode ?? null, now, now, input.requestId,
  ).run();
  return cost;
}

export async function completeAiCostLedgerEntry(requestId: string, status: string, generationId?: string | null, errorCode?: string | null) {
  await ensureAiCostLedgerStore();
  const now = new Date().toISOString();
  await database.prepare("UPDATE ai_cost_ledger SET status = ?, generation_id = COALESCE(?, generation_id), error_code = COALESCE(?, error_code), completed_at = ?, updated_at = ? WHERE request_id = ?")
    .bind(status, generationId ?? null, errorCode ?? null, now, now, requestId).run();
}
