import { ensureStore, requireAdmin } from "@/lib/auth";
import { database } from "@/lib/server-runtime";
import { getGlobalSettings } from "@/lib/billing";

const INPUT_USD_PER_MILLION = 8;
const OUTPUT_USD_PER_MILLION = 30;
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Недостаточно прав." }, { status: 403 });
  await ensureStore();
  const { brutto_coefficient: bruttoMultiplier } = await getGlobalSettings();
  const users = await database.prepare(`
    SELECT users.id, users.email, users.global_role AS role, users.created_at, users.last_login_at,
      COUNT(generations.id) AS generations,
      COALESCE(SUM(generations.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(generations.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(generations.total_tokens), 0) AS tokens,
      (COALESCE(SUM(generations.input_tokens), 0) * ${INPUT_USD_PER_MILLION} + COALESCE(SUM(generations.output_tokens), 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0 AS cost_usd,
      (COALESCE(SUM(generations.input_tokens), 0) * ${INPUT_USD_PER_MILLION} + COALESCE(SUM(generations.output_tokens), 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0 AS cost_netto_usd,
      ((COALESCE(SUM(generations.input_tokens), 0) * ${INPUT_USD_PER_MILLION} + COALESCE(SUM(generations.output_tokens), 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0) * ${bruttoMultiplier} AS cost_brutto_usd
    FROM tenant_memberships
    JOIN users ON users.id = tenant_memberships.user_id
    LEFT JOIN generations ON generations.user_id = users.id AND generations.tenant_id = tenant_memberships.tenant_id
    WHERE tenant_memberships.tenant_id = ?
    GROUP BY users.id ORDER BY users.created_at DESC
  `).bind(admin.tenantId).all();
  const generations = await database.prepare(`
    SELECT generations.id, generations.operation, generations.prompt, generations.bytes,
      generations.input_tokens, generations.output_tokens, generations.total_tokens,
      generations.created_at, users.email,
      (COALESCE(generations.input_tokens, 0) * ${INPUT_USD_PER_MILLION} + COALESCE(generations.output_tokens, 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0 AS cost_usd,
      (COALESCE(generations.input_tokens, 0) * ${INPUT_USD_PER_MILLION} + COALESCE(generations.output_tokens, 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0 AS cost_netto_usd,
      ((COALESCE(generations.input_tokens, 0) * ${INPUT_USD_PER_MILLION} + COALESCE(generations.output_tokens, 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0) * ${bruttoMultiplier} AS cost_brutto_usd
    FROM generations JOIN users ON users.id = generations.user_id
    WHERE generations.tenant_id = ?
    ORDER BY generations.created_at DESC LIMIT 100
  `).bind(admin.tenantId).all();
  return Response.json({ users: users.results, generations: generations.results, bruttoCoefficient: bruttoMultiplier });
}
