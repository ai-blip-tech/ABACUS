import { creditTokens, debitTokens, ensureBillingStore, getTokenAccount, getTokenHistory } from "./billing.ts";
import { ensureAiCostLedgerStore } from "./ai-cost-ledger.ts";
import { userAiFinance } from "./admin-ai-finance.ts";
import { adminUsersReport, type AdminUsersFilter } from "./admin-users-report.ts";
import { database } from "./server-runtime.ts";

export async function adminOverview() {
  await ensureBillingStore();
  await ensureAiCostLedgerStore();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [users, projects, generations, balances, ledger, payments, aiFinance] = await database.batch([
    database.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_users, SUM(CASE WHEN last_login_at >= ? THEN 1 ELSE 0 END) AS active_users FROM users").bind(since, since),
    database.prepare("SELECT COUNT(*) AS total FROM projects"),
    database.prepare(`SELECT COUNT(*) AS total, SUM(COALESCE(input_tokens, 0)) AS input_tokens, SUM(COALESCE(output_tokens, 0)) AS output_tokens FROM generations`),
    database.prepare("SELECT COALESCE(SUM(balance), 0) AS total FROM token_accounts"),
    database.prepare("SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS credited, COALESCE(-SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS debited FROM token_transactions"),
    database.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN provider = 'mock' THEN 1 ELSE 0 END) AS mock_count, SUM(CASE WHEN status = 'paid' AND provider <> 'mock' THEN 1 ELSE 0 END) AS paid_real_count, COALESCE(SUM(CASE WHEN status = 'paid' AND provider <> 'mock' AND currency = 'RUB' THEN amount ELSE 0 END), 0) AS paid_real_rub_kopecks FROM payments"),
    database.prepare("SELECT COUNT(*) AS operations, SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded, SUM(CASE WHEN status <> 'succeeded' THEN 1 ELSE 0 END) AS not_succeeded, COALESCE(SUM(rd_tokens_charged), 0) AS rd_tokens_charged, COALESCE(SUM(net_micro_usd), 0) AS net_micro_usd, COALESCE(SUM(gross_micro_usd), 0) AS gross_micro_usd, SUM(CASE WHEN net_micro_usd IS NOT NULL THEN 1 ELSE 0 END) AS exactly_priced FROM ai_cost_ledger"),
  ]);
  const generation = generations.results[0] as Record<string, number | null> | undefined;
  return {
    users: users.results[0] || {},
    projects: projects.results[0] || {},
    generations: { ...(generation || {}), successful: Number(generation?.total || 0), failed: null },
    aiFinance: aiFinance.results[0] || {},
    balances: balances.results[0] || {},
    ledger: ledger.results[0] || {},
    payments: payments.results[0] || {},
  };
}

export async function adminUsers(filter: AdminUsersFilter) {
  return adminUsersReport(filter);
}

export async function adminUserDetail(userId: string) {
  await ensureBillingStore();
  await ensureAiCostLedgerStore();
  const profile = await database.prepare("SELECT id, email, global_role, first_name, last_name, phone, company_role, created_at, last_login_at FROM users WHERE id = ?").bind(userId).first<Record<string, unknown>>();
  if (!profile) return null;
  const [memberships, subscription, freePlan, counts, payments, generations, projects] = await Promise.all([
    database.prepare("SELECT tenants.id, tenants.slug, tenants.name, tenant_memberships.role, tenant_memberships.created_at FROM tenant_memberships JOIN tenants ON tenants.id = tenant_memberships.tenant_id WHERE tenant_memberships.user_id = ? ORDER BY tenants.name").bind(userId).all(),
    database.prepare("SELECT subscriptions.*, plans.code, plans.name, plans.description, plans.price, plans.currency, plans.billing_period, plans.included_tokens, plans.limits_json FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id WHERE subscriptions.user_id = ? ORDER BY subscriptions.created_at DESC LIMIT 1").bind(userId).first(),
    database.prepare("SELECT * FROM plans WHERE code = 'free' AND active = 1").first(),
    database.prepare("SELECT (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS project_count, (SELECT COUNT(*) FROM generations WHERE user_id = ?) AS generation_count").bind(userId, userId).first(),
    database.prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(userId).all(),
    database.prepare("SELECT generations.id, generations.tenant_id, generations.operation, generations.created_at, generations.bytes, generations.content_type, generations.input_tokens, generations.output_tokens, generations.total_tokens, generations.token_transaction_id, generations.token_cost, generations.brutto_coefficient_snapshot, generations.image_deleted_at, generations.image_deletion_reason, ai_cost_ledger.model, ai_cost_ledger.endpoint, ai_cost_ledger.status AS cost_status, ai_cost_ledger.provider_request_id, ai_cost_ledger.input_text_tokens, ai_cost_ledger.input_image_tokens, ai_cost_ledger.output_image_tokens, ai_cost_ledger.rd_tokens_charged, ai_cost_ledger.net_micro_usd, ai_cost_ledger.gross_micro_usd FROM generations LEFT JOIN ai_cost_ledger ON ai_cost_ledger.generation_id = generations.id WHERE generations.user_id = ? ORDER BY generations.created_at DESC, generations.id DESC LIMIT 24").bind(userId).all(),
    database.prepare("SELECT id, tenant_id, name, project_type, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100").bind(userId).all(),
  ]);
  const [account, tokenHistory, aiFinance] = await Promise.all([getTokenAccount(userId), getTokenHistory(userId), userAiFinance(userId)]);
  return {
    profile,
    memberships: memberships.results,
    plan: subscription || freePlan,
    subscription: subscription || null,
    account,
    counts: counts || {},
    projects: projects.results,
    generations: generations.results,
    payments: payments.results,
    tokenHistory,
    aiFinance: aiFinance || {},
  };
}

export async function adminUserGenerations(userId: string, offset = 0, limit = 24) {
  await ensureBillingStore();
  await ensureAiCostLedgerStore();
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.min(24, Math.max(1, Math.trunc(limit))) : 24;
  const [user, count, generations] = await Promise.all([
    database.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first(),
    database.prepare("SELECT COUNT(*) AS total FROM generations WHERE user_id = ?").bind(userId).first<{ total: number }>(),
    database.prepare("SELECT generations.id, generations.tenant_id, generations.operation, generations.created_at, generations.bytes, generations.content_type, generations.token_cost, generations.image_deleted_at, generations.image_deletion_reason, ai_cost_ledger.model, ai_cost_ledger.endpoint, ai_cost_ledger.status AS cost_status, ai_cost_ledger.input_text_tokens, ai_cost_ledger.input_image_tokens, ai_cost_ledger.output_image_tokens, ai_cost_ledger.rd_tokens_charged, ai_cost_ledger.net_micro_usd, ai_cost_ledger.gross_micro_usd FROM generations LEFT JOIN ai_cost_ledger ON ai_cost_ledger.generation_id = generations.id WHERE generations.user_id = ? ORDER BY generations.created_at DESC, generations.id DESC LIMIT ? OFFSET ?").bind(userId, safeLimit, safeOffset).all(),
  ]);
  if (!user) return null;
  const total = Number(count?.total || 0);
  return {
    generations: generations.results,
    total,
    offset: safeOffset,
    limit: safeLimit,
    nextOffset: safeOffset + safeLimit < total ? safeOffset + safeLimit : null,
  };
}

export async function adjustUserTokens(input: { adminUserId: string; userId: string; direction: "credit" | "debit"; amount: number; reason: string; idempotencyKey: string }) {
  await ensureBillingStore();
  const amount = Math.trunc(input.amount);
  const reason = input.reason.trim().slice(0, 500);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Укажите положительное целое количество токенов.");
  if (!reason) throw new Error("Укажите причину операции.");
  if (!await database.prepare("SELECT id FROM users WHERE id = ?").bind(input.userId).first()) throw new Error("Пользователь не найден.");
  const operationId = crypto.randomUUID();
  const mutation = {
    userId: input.userId,
    type: "correction" as const,
    amount,
    referenceType: "admin_adjustment",
    referenceId: operationId,
    initiatedByAdminId: input.adminUserId,
    description: reason,
    metadata: { direction: input.direction },
    idempotencyKey: `${input.adminUserId}:${input.idempotencyKey}`,
    auditAction: input.direction === "credit" ? "tokens.credit" : "tokens.debit",
  };
  return input.direction === "credit" ? creditTokens(mutation) : debitTokens(mutation);
}

export async function assignUserPlan(input: { adminUserId: string; userId: string; planId: string }) {
  await ensureBillingStore();
  return database.transaction((sqlite) => {
    const user = sqlite.prepare("SELECT id FROM users WHERE id = ?").get(input.userId);
    const plan = sqlite.prepare("SELECT id, code, name FROM plans WHERE id = ? AND active = 1").get(input.planId) as { id: string; code: string; name: string } | undefined;
    if (!user) throw new Error("Пользователь не найден.");
    if (!plan) throw new Error("Тариф не найден или отключён.");
    const current = sqlite.prepare("SELECT subscriptions.id, subscriptions.plan_id FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(input.userId) as { id: string; plan_id: string } | undefined;
    if (current?.plan_id === plan.id) return sqlite.prepare("SELECT * FROM subscriptions WHERE id = ?").get(current.id);
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE subscriptions SET status = 'replaced', updated_at = ? WHERE user_id = ? AND status = 'active'").run(now, input.userId);
    const id = crypto.randomUUID();
    sqlite.prepare("INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, current_period_start, cancel_at_period_end, provider, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, 0, 'admin', ?, ?)")
      .run(id, input.userId, plan.id, now, now, now, now);
    sqlite.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, 'plan.assign', 'user', ?, ?, ?)")
      .run(crypto.randomUUID(), input.adminUserId, input.userId, JSON.stringify({ planId: plan.id, planCode: plan.code, planName: plan.name, previousPlanId: current?.plan_id || null }), now);
    return sqlite.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id);
  });
}
