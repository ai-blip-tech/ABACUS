import { currentUser, ensureStore } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  await ensureStore();
  const [plan, subscription] = await Promise.all([
    getUserPlan(user.id),
    database.prepare("SELECT id, status, started_at, current_period_start, current_period_end FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(user.id).first(),
  ]);
  return Response.json({ plan, subscription: subscription || null });
}
