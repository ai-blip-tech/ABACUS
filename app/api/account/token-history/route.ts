import { currentUser } from "@/lib/auth";
import { ensureBillingStore } from "@/lib/billing";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  await ensureBillingStore();
  const rows = await database.prepare("SELECT token_transactions.*, generations.id AS generation_id, generations.operation AS generation_operation, generations.project_id, generations.project_name_snapshot, generations.token_cost AS generation_token_cost, generations.netto_usd_snapshot, generations.brutto_coefficient_snapshot, COALESCE((SELECT SUM(refunds.amount) FROM token_transactions AS refunds WHERE refunds.user_id = token_transactions.user_id AND refunds.type = 'refund' AND refunds.reference_id = token_transactions.reference_id), 0) AS refunded_amount, COALESCE((SELECT refunds.balance_after FROM token_transactions AS refunds WHERE refunds.user_id = token_transactions.user_id AND refunds.type = 'refund' AND refunds.reference_id = token_transactions.reference_id ORDER BY refunds.created_at DESC LIMIT 1), token_transactions.balance_after) AS effective_balance_after FROM token_transactions LEFT JOIN generations ON generations.id = token_transactions.reference_id AND token_transactions.reference_type = 'ai_operation' WHERE token_transactions.user_id = ? ORDER BY token_transactions.created_at DESC LIMIT 200").bind(user.id).all<Record<string, unknown>>();
  const transactions = rows.results.map((row) => {
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(String(row.metadata_json || "{}")) as Record<string, unknown>; } catch { /* Older rows may have empty metadata. */ }
    const calculatedTokenCost = Number(row.generation_token_cost ?? metadata.calculatedTokenCost ?? metadata.tokenCost ?? (row.type === "generation" ? Math.abs(Number(row.amount)) : 0));
    return {
      id: row.id,
      type: row.type,
      operation: row.generation_operation ?? metadata.operation ?? row.type,
      projectId: row.project_id ?? null,
      projectName: row.project_name_snapshot ?? null,
      calculatedTokenCost,
      actualDebit: row.type === "generation" ? Math.max(0, -Number(row.amount) - Number(row.refunded_amount || 0)) : 0,
      noDebit: Boolean(metadata.noDebit),
      status: row.generation_id ? "completed" : row.type === "generation" ? "not_completed" : "recorded",
      balanceBefore: Number(row.balance_before),
      balanceAfter: Number(row.effective_balance_after),
      nettoUsd: row.netto_usd_snapshot ?? metadata.nettoUsd ?? null,
      bruttoCoefficient: row.brutto_coefficient_snapshot ?? metadata.bruttoCoefficient ?? null,
      createdAt: row.created_at,
    };
  });
  return Response.json({ transactions });
}
