import { chargeActualAiTokens, getGlobalSettings } from "../billing.ts";
import { database } from "../server-runtime.ts";

export type OnoTextUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  calls: number;
};

type TextPricing = {
  version: string;
  source: string;
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
};

const TEXT_PRICING: Record<string, TextPricing> = {
  "gpt-6.1-sol": {
    version: "openai-text-2026-10-11",
    source: "https://developers.openai.com/api/docs/models/gpt-6.1-sol",
    inputUsd: 2,
    cachedInputUsd: 0.1,
    outputUsd: 10,
  },
  "gpt-6-astra": {
    version: "openai-text-2026-10-12",
    source: "https://developers.openai.com/api/docs/models/gpt-6-astra",
    inputUsd: 10,
    cachedInputUsd: 1,
    outputUsd: 50,
  },
  "gpt-4o-mini-transcribe": {
    version: "openai-audio-2026-10-13",
    source: "https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe",
    inputUsd: 1.25,
    cachedInputUsd: 0,
    outputUsd: 5,
  },
};

let setupPromise: Promise<void> | null = null;

export function ensureOnoFinanceStore() {
  if (setupPromise) return setupPromise;
  setupPromise = database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS ono_cost_ledger (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      user_id TEXT,
      visitor_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status TEXT NOT NULL,
      model_calls INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      cached_input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      usage_json TEXT,
      pricing_snapshot_json TEXT,
      net_micro_usd INTEGER,
      gross_coefficient_snapshot REAL NOT NULL,
      gross_micro_usd INTEGER,
      error_code TEXT,
      rd_tokens_charged INTEGER NOT NULL DEFAULT 0,
      rd_tokens_quoted INTEGER NOT NULL DEFAULT 0,
      token_transaction_id TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES ono_chat_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_cost_created ON ono_cost_ledger(created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_cost_tenant_created ON ono_cost_ledger(tenant_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_cost_user_created ON ono_cost_ledger(user_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_cost_session ON ono_cost_ledger(session_id)"),
  ]).then(async () => {
    const columns = await database.prepare("PRAGMA table_info(ono_cost_ledger)").all<{ name: string }>();
    const names = new Set(columns.results.map((column) => column.name));
    if (!names.has("rd_tokens_charged")) await database.prepare("ALTER TABLE ono_cost_ledger ADD COLUMN rd_tokens_charged INTEGER NOT NULL DEFAULT 0").run();
    if (!names.has("rd_tokens_quoted")) await database.prepare("ALTER TABLE ono_cost_ledger ADD COLUMN rd_tokens_quoted INTEGER NOT NULL DEFAULT 0").run();
    if (!names.has("token_transaction_id")) await database.prepare("ALTER TABLE ono_cost_ledger ADD COLUMN token_transaction_id TEXT").run();
    await database.prepare("UPDATE ono_cost_ledger SET gross_coefficient_snapshot = 3, gross_micro_usd = CASE WHEN net_micro_usd IS NULL THEN NULL ELSE ROUND(net_micro_usd * 3) END WHERE gross_coefficient_snapshot <> 3 OR (net_micro_usd IS NOT NULL AND (gross_micro_usd IS NULL OR gross_micro_usd <> ROUND(net_micro_usd * 3)))").run();
  });
  return setupPromise;
}

const integer = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

export function calculateOnoTextCost(
  model: string,
  usage: OnoTextUsage,
  grossCoefficient: number,
  endpoint = "openai.responses",
) {
  const pricing = TEXT_PRICING[model];
  const inputTokens = integer(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, integer(usage.cachedInputTokens));
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = integer(usage.outputTokens);
  const netMicroUsd = pricing
    ? Math.round(uncachedInputTokens * pricing.inputUsd + cachedInputTokens * pricing.cachedInputUsd + outputTokens * pricing.outputUsd)
    : null;
  return {
    pricingSnapshot: pricing ? { ...pricing, model, endpoint, currency: "USD", unit: "per_million_tokens" } : null,
    netMicroUsd,
    grossMicroUsd: netMicroUsd === null ? null : Math.round(netMicroUsd * grossCoefficient),
  };
}

export async function recordOnoFinancialUsage(input: {
  requestId: string;
  sessionId: string;
  userId: string | null;
  visitorId: string;
  tenantId: string;
  siteId: string;
  model: string;
  status: "succeeded" | "failed";
  usage: OnoTextUsage;
  errorCode?: string | null;
}) {
  await beginOnoFinancialUsage(input);
  return completeOnoFinancialUsage(input);
}

export async function beginOnoFinancialUsage(input: {
  requestId: string;
  sessionId: string;
  userId: string | null;
  visitorId: string;
  tenantId: string;
  siteId: string;
  model: string;
  operationType?: "ono_conversation" | "ono_transcription";
  endpoint?: "openai.responses" | "openai.audio.transcriptions";
}) {
  await ensureOnoFinanceStore();
  const settings = await getGlobalSettings();
  const now = new Date().toISOString();
  const result = await database.prepare(`INSERT OR IGNORE INTO ono_cost_ledger (
    id, request_id, session_id, user_id, visitor_id, tenant_id, site_id, operation_type,
    provider, model, endpoint, status, gross_coefficient_snapshot, created_at, completed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'openai', ?, ?, 'pending', ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), input.requestId, input.sessionId, input.userId, input.visitorId,
      input.tenantId, input.siteId, input.operationType || "ono_conversation", input.model,
      input.endpoint || "openai.responses", settings.brutto_coefficient, now, now,
    ).run();
  return Number(result.meta.changes) > 0;
}

export async function completeOnoFinancialUsage(input: {
  requestId: string;
  model: string;
  status: "succeeded" | "failed";
  usage: OnoTextUsage;
  errorCode?: string | null;
  endpoint?: "openai.responses" | "openai.audio.transcriptions";
  usageKnown?: boolean;
}) {
  await ensureOnoFinanceStore();
  const row = await database.prepare("SELECT status, user_id, operation_type, gross_coefficient_snapshot, net_micro_usd, gross_micro_usd, rd_tokens_charged, rd_tokens_quoted, token_transaction_id FROM ono_cost_ledger WHERE request_id = ?").bind(input.requestId).first<{
    status: string;
    user_id: string | null;
    operation_type: string;
    gross_coefficient_snapshot: number;
    net_micro_usd: number | null;
    gross_micro_usd: number | null;
    rd_tokens_charged: number;
    rd_tokens_quoted: number;
    token_transaction_id: string | null;
  }>();
  if (!row) throw new Error("Финансовая операция ОНО не найдена.");
  if (row.status !== "pending") {
    return {
      pricingSnapshot: null,
      netMicroUsd: row.net_micro_usd,
      grossMicroUsd: row.gross_micro_usd,
      rdTokensCharged: Number(row.rd_tokens_charged || 0),
      rdTokensQuoted: Number(row.rd_tokens_quoted || 0),
      tokenTransactionId: row.token_transaction_id,
    };
  }
  const grossCoefficient = Number(row?.gross_coefficient_snapshot || 1);
  const cost = calculateOnoTextCost(input.model, input.usage, grossCoefficient, input.endpoint);
  const hasProviderUsage = input.usageKnown !== false && integer(input.usage.calls) > 0;
  const netMicroUsd = hasProviderUsage ? cost.netMicroUsd : null;
  const grossMicroUsd = hasProviderUsage ? cost.grossMicroUsd : null;
  let rdTokensQuoted = 0;
  let rdTokensCharged = 0;
  let tokenTransactionId: string | null = null;
  if (input.status === "succeeded" && row.user_id && grossMicroUsd !== null) {
    try {
      const charge = await chargeActualAiTokens({
        userId: row.user_id,
        operation: row.operation_type,
        referenceId: input.requestId,
        grossMicroUsd,
        idempotencyKey: `ono-charge:${row.user_id}:${input.requestId}`,
      });
      rdTokensQuoted = charge.tokenCost;
      if (charge.transaction) {
        const transaction = charge.transaction as { id?: string; amount?: number };
        tokenTransactionId = transaction.id || null;
        rdTokensCharged = Math.abs(Number(transaction.amount || 0));
      }
    } catch (error) {
      console.error("[Ono] RD token charge failed", { requestId: input.requestId, message: error instanceof Error ? error.message : "unknown" });
    }
  }
  const now = new Date().toISOString();
  await database.prepare(`UPDATE ono_cost_ledger SET status = ?, model_calls = ?, input_tokens = ?,
    cached_input_tokens = ?, output_tokens = ?, total_tokens = ?, usage_json = ?, pricing_snapshot_json = ?,
    net_micro_usd = ?, gross_micro_usd = ?, rd_tokens_charged = ?, rd_tokens_quoted = ?, token_transaction_id = ?,
    error_code = ?, completed_at = ? WHERE request_id = ? AND status = 'pending'`)
    .bind(
      input.status, input.usage.calls, integer(input.usage.inputTokens), integer(input.usage.cachedInputTokens),
      integer(input.usage.outputTokens), integer(input.usage.totalTokens), JSON.stringify(input.usage),
      cost.pricingSnapshot ? JSON.stringify(cost.pricingSnapshot) : null, netMicroUsd, grossMicroUsd,
      rdTokensCharged, rdTokensQuoted, tokenTransactionId, input.errorCode || null, now, input.requestId,
    ).run();
  return { ...cost, netMicroUsd, grossMicroUsd, rdTokensCharged, rdTokensQuoted, tokenTransactionId };
}
