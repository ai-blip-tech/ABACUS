import { ensureStore, requireGlobalAdmin } from "@/lib/auth";
import { listActivePlans } from "@/lib/billing";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureStore();
  const users = await database.prepare("SELECT users.id, users.email, users.global_role, users.first_name, users.last_name, users.created_at, COALESCE(token_accounts.balance, 0) AS token_balance, COALESCE((SELECT plans.code FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id WHERE subscriptions.user_id = users.id AND subscriptions.status = 'active' ORDER BY subscriptions.created_at DESC LIMIT 1), 'metered') AS plan_code, COALESCE((SELECT plans.name FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id WHERE subscriptions.user_id = users.id AND subscriptions.status = 'active' ORDER BY subscriptions.created_at DESC LIMIT 1), 'По токенам') AS plan_name FROM users LEFT JOIN token_accounts ON token_accounts.user_id = users.id ORDER BY users.created_at DESC LIMIT 500").all();
  return Response.json({ users: users.results, plans: await listActivePlans() });
}
