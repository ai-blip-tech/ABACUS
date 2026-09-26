import { ensureStore, requireGlobalAdmin } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureStore();
  const rows = await database.prepare("SELECT token_transactions.*, users.email FROM token_transactions JOIN users ON users.id = token_transactions.user_id ORDER BY token_transactions.created_at DESC LIMIT 500").all();
  return Response.json({ transactions: rows.results });
}
