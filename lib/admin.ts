import { creditTokens, debitTokens, ensureBillingStore, getTokenAccount, getTokenHistory } from "./billing.ts";
import { database } from "./server-runtime.ts";

const INPUT_USD_PER_MILLION = 8;
const OUTPUT_USD_PER_MILLION = 30;

export async function adminOverview() {
  await ensureBillingStore();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [users, projects, generations, balances, ledger, payments] = await database.batch([
    database.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_users, SUM(CASE WHEN last_login_at >= ? THEN 1 ELSE 0 END) AS active_users FROM users").bind(since, since),
    database.prepare("SELECT COUNT(*) AS total FROM projects"),
    database.prepare(`SELECT COUNT(*) AS total, SUM(COALESCE(input_tokens, 0)) AS input_tokens, SUM(COALESCE(output_tokens, 0)) AS output_tokens FROM generations`),
    database.prepare("SELECT COALESCE(SUM(balance), 0) AS total FROM token_accounts"),
    database.prepare("SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS credited, COALESCE(-SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS debited FROM token_transactions"),
    database.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN provider = 'mock' THEN 1 ELSE 0 END) AS mock_count, SUM(CASE WHEN status = 'paid' AND provider <> 'mock' THEN 1 ELSE 0 END) AS paid_real_count, COALESCE(SUM(CASE WHEN status = 'paid' AND provider <> 'mock' AND currency = 'RUB' THEN amount ELSE 0 END), 0) AS paid_real_rub_kopecks FROM payments"),
  ]);
  const generation = generations.results[0] as Record<string, number | null> | undefined;
  const estimatedNetUsd = ((Number(generation?.input_tokens || 0) * INPUT_USD_PER_MILLION) + (Number(generation?.output_tokens || 0) * OUTPUT_USD_PER_MILLION)) / 1_000_000;
  return {
    users: users.results[0] || {},
    projects: projects.results[0] || {},
    generations: { ...(generation || {}), successful: Number(generation?.total || 0), failed: null, estimated_net_usd: estimatedNetUsd },
    balances: balances.results[0] || {},
    ledger: ledger.results[0] || {},
    payments: payments.results[0] || {},
  };
}

export async function adminUsers(search = "") {
  await ensureBillingStore();
  const query = `%${search.trim().toLowerCase().slice(0, 160)}%`;
  const users = await database.prepare(`
    SELECT users.id, users.email, users.global_role, users.first_name, users.last_name,
      users.company_role, users.created_at, users.last_login_at,
      COALESCE(token_accounts.balance, 0) AS token_balance,
      (SELECT COUNT(*) FROM projects WHERE projects.user_id = users.id) AS project_count,
      (SELECT COUNT(*) FROM generations WHERE generations.user_id = users.id) AS generation_count,
      (SELECT plans.name FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id WHERE subscriptions.user_id = users.id ORDER BY subscriptions.created_at DESC LIMIT 1) AS plan_name
    FROM users LEFT JOIN token_accounts ON token_accounts.user_id = users.id
    WHERE lower(users.email) LIKE ? OR lower(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) LIKE ? OR lower(COALESCE(users.company_role, '')) LIKE ?
    ORDER BY users.created_at DESC LIMIT 500
  `).bind(query, query, query).all<Record<string, unknown>>();
  const memberships = await database.prepare(`
    SELECT tenant_memberships.user_id, tenants.id, tenants.slug, tenants.name, tenant_memberships.role
    FROM tenant_memberships JOIN tenants ON tenants.id = tenant_memberships.tenant_id
    ORDER BY tenants.name
  `).all<Record<string, unknown>>();
  return users.results.map((user) => ({
    ...user,
    plan_name: user.plan_name || "Free",
    memberships: memberships.results.filter((membership) => membership.user_id === user.id),
  }));
}

export async function adminUserDetail(userId: string) {
  await ensureBillingStore();
  const profile = await database.prepare("SELECT id, email, global_role, first_name, last_name, phone, company_role, created_at, last_login_at FROM users WHERE id = ?").bind(userId).first<Record<string, unknown>>();
  if (!profile) return null;
  const [memberships, subscription, freePlan, counts, payments, generations, projects] = await Promise.all([
    database.prepare("SELECT tenants.id, tenants.slug, tenants.name, tenant_memberships.role, tenant_memberships.created_at FROM tenant_memberships JOIN tenants ON tenants.id = tenant_memberships.tenant_id WHERE tenant_memberships.user_id = ? ORDER BY tenants.name").bind(userId).all(),
    database.prepare("SELECT subscriptions.*, plans.code, plans.name, plans.description, plans.price, plans.currency, plans.billing_period, plans.included_tokens, plans.limits_json FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id WHERE subscriptions.user_id = ? ORDER BY subscriptions.created_at DESC LIMIT 1").bind(userId).first(),
    database.prepare("SELECT * FROM plans WHERE code = 'free' AND active = 1").first(),
    database.prepare("SELECT (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS project_count, (SELECT COUNT(*) FROM generations WHERE user_id = ?) AS generation_count").bind(userId, userId).first(),
    database.prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(userId).all(),
    database.prepare("SELECT id, tenant_id, operation, created_at, bytes, content_type, input_tokens, output_tokens, total_tokens, token_transaction_id, token_cost, brutto_coefficient_snapshot FROM generations WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 24").bind(userId).all(),
    database.prepare("SELECT id, tenant_id, name, project_type, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100").bind(userId).all(),
  ]);
  const [account, tokenHistory] = await Promise.all([getTokenAccount(userId), getTokenHistory(userId)]);
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
  };
}

export async function adminUserGenerations(userId: string, offset = 0, limit = 24) {
  await ensureBillingStore();
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.min(24, Math.max(1, Math.trunc(limit))) : 24;
  const [user, count, generations] = await Promise.all([
    database.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first(),
    database.prepare("SELECT COUNT(*) AS total FROM generations WHERE user_id = ?").bind(userId).first<{ total: number }>(),
    database.prepare("SELECT id, tenant_id, operation, created_at, bytes, content_type, token_cost FROM generations WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?").bind(userId, safeLimit, safeOffset).all(),
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
