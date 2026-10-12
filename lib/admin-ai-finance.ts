import { calculateImageProviderCost, ensureAiCostLedgerStore } from "./ai-cost-ledger.ts";
import { getGlobalSettings } from "./billing.ts";
import { imageModel } from "./image-model.ts";
import { database } from "./server-runtime.ts";

export type FinancePeriod = { key: string; label: string; from: string; to: string };

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const iso = (date: Date) => date.toISOString();

export function resolveFinancePeriod(url: URL): FinancePeriod {
  const now = new Date();
  const key = url.searchParams.get("period") || "30d";
  let from = new Date(now.getTime() - 30 * 86400000);
  let to = now;
  let label = "Последние 30 дней";
  if (key === "today") { from = startOfDay(now); label = "Сегодня"; }
  else if (key === "7d") { from = new Date(now.getTime() - 7 * 86400000); label = "Последние 7 дней"; }
  else if (key === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1); label = "Этот месяц"; }
  else if (key === "last_month") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); label = "Прошлый месяц"; }
  else if (key === "custom") {
    const customFrom = url.searchParams.get("from");
    const customTo = url.searchParams.get("to");
    if (customFrom && !Number.isNaN(Date.parse(customFrom))) from = startOfDay(new Date(customFrom));
    if (customTo && !Number.isNaN(Date.parse(customTo))) { to = startOfDay(new Date(customTo)); to.setDate(to.getDate() + 1); }
    if (to <= from) to = new Date(from.getTime() + 86400000);
    label = "Выбранный период";
  }
  return { key, label, from: iso(from), to: iso(to) };
}

export async function adminAiFinance(period: FinancePeriod) {
  await ensureAiCostLedgerStore();
  const settings = await getGlobalSettings();
  const model = imageModel();
  const currentPricing = calculateImageProviderCost(model, "openai.images.edits", { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { text_tokens: 0, image_tokens: 0 } }, settings.brutto_coefficient).pricingSnapshot;
  const where = "created_at >= ? AND created_at < ?";
  const [totals, days, operations] = await Promise.all([
    database.prepare(`SELECT
      COUNT(*) AS operations,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status <> 'succeeded' THEN 1 ELSE 0 END) AS not_succeeded,
      COALESCE(SUM(rd_tokens_charged), 0) AS rd_tokens_charged,
      COALESCE(SUM(rd_tokens_quoted), 0) AS rd_tokens_quoted,
      COALESCE(SUM(input_text_tokens), 0) AS input_text_tokens,
      COALESCE(SUM(input_image_tokens), 0) AS input_image_tokens,
      COALESCE(SUM(output_image_tokens), 0) AS output_image_tokens,
      COALESCE(SUM(net_micro_usd), 0) AS net_micro_usd,
      COALESCE(SUM(gross_micro_usd), 0) AS gross_micro_usd,
      SUM(CASE WHEN net_micro_usd IS NOT NULL THEN 1 ELSE 0 END) AS exactly_priced,
      COUNT(DISTINCT user_id) AS users
    FROM ai_cost_ledger WHERE ${where}`).bind(period.from, period.to).first<Record<string, unknown>>(),
    database.prepare(`SELECT substr(created_at, 1, 10) AS day,
      COUNT(*) AS operations, COALESCE(SUM(rd_tokens_charged), 0) AS rd_tokens_charged,
      COALESCE(SUM(input_text_tokens), 0) AS input_text_tokens,
      COALESCE(SUM(input_image_tokens), 0) AS input_image_tokens,
      COALESCE(SUM(output_image_tokens), 0) AS output_image_tokens,
      COALESCE(SUM(net_micro_usd), 0) AS net_micro_usd,
      COALESCE(SUM(gross_micro_usd), 0) AS gross_micro_usd
    FROM ai_cost_ledger WHERE ${where} GROUP BY substr(created_at, 1, 10) ORDER BY day DESC`).bind(period.from, period.to).all(),
    database.prepare(`SELECT operation_type, COUNT(*) AS operations,
      COALESCE(SUM(rd_tokens_charged), 0) AS rd_tokens_charged,
      COALESCE(SUM(net_micro_usd), 0) AS net_micro_usd,
      COALESCE(SUM(gross_micro_usd), 0) AS gross_micro_usd
    FROM ai_cost_ledger WHERE ${where} GROUP BY operation_type ORDER BY gross_micro_usd DESC, operations DESC`).bind(period.from, period.to).all(),
  ]);
  return { period, totals: totals || {}, days: days.results, operations: operations.results, currentPricing, grossCoefficient: settings.brutto_coefficient, model };
}

export async function userAiFinance(userId: string, period?: FinancePeriod) {
  await ensureAiCostLedgerStore();
  const filter = period ? "AND created_at >= ? AND created_at < ?" : "";
  const values = period ? [userId, period.from, period.to] : [userId];
  return await database.prepare(`SELECT COUNT(*) AS operations,
    COALESCE(SUM(rd_tokens_charged), 0) AS rd_tokens_charged,
    COALESCE(SUM(rd_tokens_quoted), 0) AS rd_tokens_quoted,
    COALESCE(SUM(input_text_tokens), 0) AS input_text_tokens,
    COALESCE(SUM(input_image_tokens), 0) AS input_image_tokens,
    COALESCE(SUM(output_image_tokens), 0) AS output_image_tokens,
    COALESCE(SUM(net_micro_usd), 0) AS net_micro_usd,
    COALESCE(SUM(gross_micro_usd), 0) AS gross_micro_usd,
    SUM(CASE WHEN net_micro_usd IS NOT NULL THEN 1 ELSE 0 END) AS exactly_priced
  FROM ai_cost_ledger WHERE user_id = ? ${filter}`).bind(...values).first<Record<string, unknown>>();
}
