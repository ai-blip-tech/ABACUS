import { currentUser, ensureStore } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  await ensureStore();
  const subscription = await database.prepare("SELECT subscriptions.*, plans.code, plans.name, plans.description, plans.price, plans.currency, plans.billing_period, plans.included_tokens, plans.limits_json FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id WHERE subscriptions.user_id = ? ORDER BY subscriptions.created_at DESC LIMIT 1").bind(user.id).first();
  const freePlan = await database.prepare("SELECT * FROM plans WHERE code = 'free' AND active = 1").first();
  return Response.json({ plan: subscription || freePlan, subscription: subscription || null });
}
