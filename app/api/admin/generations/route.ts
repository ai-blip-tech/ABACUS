import { requireGlobalAdmin } from "@/lib/auth";
import { ensureStore } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

const INPUT_USD_PER_MILLION = 8;
const OUTPUT_USD_PER_MILLION = 30;

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureStore();
  const generations = await database.prepare(`SELECT generations.id, generations.tenant_id, generations.operation,
    generations.created_at, generations.input_tokens, generations.output_tokens, generations.total_tokens,
    generations.token_transaction_id, generations.token_cost, generations.brutto_coefficient_snapshot,
    generations.image_deleted_at, generations.image_deletion_reason,
    users.id AS user_id, users.email, tenants.name AS tenant_name,
    (COALESCE(generations.input_tokens, 0) * ${INPUT_USD_PER_MILLION} + COALESCE(generations.output_tokens, 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0 AS estimated_net_usd
    FROM generations JOIN users ON users.id = generations.user_id
    LEFT JOIN tenants ON tenants.id = generations.tenant_id
    ORDER BY generations.created_at DESC LIMIT 500`).all();
  return Response.json({ generations: generations.results, tracking: { model: false, status: false, project: false, actualProviderCost: false, duration: false } });
}
