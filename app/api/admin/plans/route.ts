import { requireGlobalAdmin } from "@/lib/auth";
import { ensureBillingStore } from "@/lib/billing";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureBillingStore();
  const plans = await database.prepare(`SELECT plans.*,
    (SELECT COUNT(*) FROM subscriptions WHERE subscriptions.plan_id = plans.id AND subscriptions.status = 'active')
    + CASE WHEN plans.code = 'free' THEN (SELECT COUNT(*) FROM users WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.user_id = users.id AND subscriptions.status = 'active')) ELSE 0 END AS user_count
    FROM plans ORDER BY sort_order, price`).all();
  return Response.json({ plans: plans.results });
}
