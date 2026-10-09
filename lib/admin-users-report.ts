import { ensureStore } from "./auth.ts";
import { ensureBillingStore } from "./billing.ts";
import { ensureAiCostLedgerStore } from "./ai-cost-ledger.ts";
import { BUSINESS_TIME_ZONE, dateRangeUtc, defaultMonthRange, isDateOnly } from "./business-time.ts";
import { database } from "./server-runtime.ts";

export type AdminUsersFilter = {
  search: string;
  tenantId: string;
  fromDate: string;
  toDate: string;
  from: string;
  toExclusive: string;
  timeZone: string;
};

export function resolveAdminUsersFilter(url: URL, now = new Date()): AdminUsersFilter {
  const defaults = defaultMonthRange(now);
  const requestedFrom = url.searchParams.get("from") || defaults.fromDate;
  const requestedTo = url.searchParams.get("to") || defaults.toDate;
  const fromDate = isDateOnly(requestedFrom) ? requestedFrom : defaults.fromDate;
  const toDate = isDateOnly(requestedTo) ? requestedTo : defaults.toDate;
  const range = dateRangeUtc(fromDate, toDate);
  return {
    search: (url.searchParams.get("search") || url.searchParams.get("q") || "").trim().slice(0, 160),
    tenantId: (url.searchParams.get("tenant") || "").trim().slice(0, 120),
    fromDate,
    toDate,
    from: range.from,
    toExclusive: range.toExclusive,
    timeZone: BUSINESS_TIME_ZONE,
  };
}

export async function adminUsersReport(filter: AdminUsersFilter) {
  await ensureStore();
  await ensureBillingStore();
  await ensureAiCostLedgerStore();
  const query = `%${filter.search.toLowerCase()}%`;
  const users = await database.prepare(`
    WITH period_ledger AS (
      SELECT user_id,
        COUNT(*) AS ai_operation_count,
        COALESCE(SUM(rd_tokens_charged), 0) AS ai_rd_tokens_charged,
        COALESCE(SUM(input_text_tokens), 0) AS input_text_tokens,
        COALESCE(SUM(input_image_tokens), 0) AS input_image_tokens,
        COALESCE(SUM(output_image_tokens), 0) AS output_image_tokens,
        COALESCE(SUM(net_micro_usd), 0) AS ai_net_micro_usd,
        COALESCE(SUM(gross_micro_usd), 0) AS ai_gross_micro_usd
      FROM ai_cost_ledger
      WHERE created_at >= ? AND created_at < ? AND (? = '' OR tenant_id = ?)
      GROUP BY user_id
    )
    SELECT users.id, users.email, users.global_role, users.first_name, users.last_name,
      users.company_role, users.created_at, users.last_login_at,
      COALESCE(token_accounts.balance, 0) AS token_balance,
      (SELECT COUNT(*) FROM projects WHERE projects.user_id = users.id) AS project_count,
      (SELECT COUNT(*) FROM generations WHERE generations.user_id = users.id) AS generation_count,
      COALESCE(period_ledger.ai_operation_count, 0) AS ai_operation_count,
      COALESCE(period_ledger.ai_rd_tokens_charged, 0) AS ai_rd_tokens_charged,
      COALESCE(period_ledger.input_text_tokens, 0) AS input_text_tokens,
      COALESCE(period_ledger.input_image_tokens, 0) AS input_image_tokens,
      COALESCE(period_ledger.output_image_tokens, 0) AS output_image_tokens,
      COALESCE(period_ledger.ai_net_micro_usd, 0) AS ai_net_micro_usd,
      COALESCE(period_ledger.ai_gross_micro_usd, 0) AS ai_gross_micro_usd,
      (SELECT plans.name FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id WHERE subscriptions.user_id = users.id ORDER BY subscriptions.created_at DESC LIMIT 1) AS plan_name
    FROM users
    LEFT JOIN token_accounts ON token_accounts.user_id = users.id
    LEFT JOIN period_ledger ON period_ledger.user_id = users.id
    WHERE (lower(users.email) LIKE ? OR lower(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) LIKE ? OR lower(COALESCE(users.company_role, '')) LIKE ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_memberships.user_id = users.id AND tenant_memberships.tenant_id = ?))
    ORDER BY users.created_at DESC
  `).bind(
    filter.from, filter.toExclusive, filter.tenantId, filter.tenantId,
    query, query, query, filter.tenantId, filter.tenantId,
  ).all<Record<string, unknown>>();
  const memberships = await database.prepare(`
    SELECT tenant_memberships.user_id, tenants.id, tenants.slug, tenants.name, tenant_memberships.role
    FROM tenant_memberships JOIN tenants ON tenants.id = tenant_memberships.tenant_id
    ORDER BY tenants.name
  `).all<Record<string, unknown>>();
  const rows: Array<Record<string, unknown> & { memberships: Record<string, unknown>[] }> = users.results.map((user) => ({
    ...user,
    plan_name: user.plan_name || "Free",
    memberships: memberships.results.filter((membership) => membership.user_id === user.id),
  }));
  const totals = rows.reduce((result, user) => ({
    users: result.users + 1,
    ai_operation_count: result.ai_operation_count + Number(user.ai_operation_count || 0),
    ai_rd_tokens_charged: result.ai_rd_tokens_charged + Number(user.ai_rd_tokens_charged || 0),
    input_text_tokens: result.input_text_tokens + Number(user.input_text_tokens || 0),
    input_image_tokens: result.input_image_tokens + Number(user.input_image_tokens || 0),
    output_image_tokens: result.output_image_tokens + Number(user.output_image_tokens || 0),
    ai_net_micro_usd: result.ai_net_micro_usd + Number(user.ai_net_micro_usd || 0),
    ai_gross_micro_usd: result.ai_gross_micro_usd + Number(user.ai_gross_micro_usd || 0),
  }), {
    users: 0, ai_operation_count: 0, ai_rd_tokens_charged: 0,
    input_text_tokens: 0, input_image_tokens: 0, output_image_tokens: 0,
    ai_net_micro_usd: 0, ai_gross_micro_usd: 0,
  });
  const coefficient = await database.prepare(`
    SELECT COUNT(DISTINCT gross_coefficient_snapshot) AS variants,
      MIN(gross_coefficient_snapshot) AS minimum,
      MAX(gross_coefficient_snapshot) AS maximum
    FROM ai_cost_ledger JOIN users ON users.id = ai_cost_ledger.user_id
    WHERE ai_cost_ledger.created_at >= ? AND ai_cost_ledger.created_at < ?
      AND (? = '' OR ai_cost_ledger.tenant_id = ?)
      AND (lower(users.email) LIKE ? OR lower(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) LIKE ? OR lower(COALESCE(users.company_role, '')) LIKE ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_memberships.user_id = users.id AND tenant_memberships.tenant_id = ?))
  `).bind(
    filter.from, filter.toExclusive, filter.tenantId, filter.tenantId,
    query, query, query, filter.tenantId, filter.tenantId,
  ).first<Record<string, unknown>>();
  return { users: rows, totals, filter, grossCoefficient: coefficient || { variants: 0, minimum: null, maximum: null } };
}
