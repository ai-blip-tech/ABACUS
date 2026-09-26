import { ensureStore, requireGlobalAdmin } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureStore();
  const users = await database.prepare("SELECT users.id, users.email, users.global_role, users.first_name, users.last_name, users.created_at, COALESCE(token_accounts.balance, 0) AS token_balance FROM users LEFT JOIN token_accounts ON token_accounts.user_id = users.id ORDER BY users.created_at DESC LIMIT 500").all();
  return Response.json({ users: users.results });
}
