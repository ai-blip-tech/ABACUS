import { currentUser, ensureStore } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  await ensureStore();
  const rows = await database.prepare("SELECT id, tenant_id, operation, prompt, output_key, content_type, bytes, input_tokens, output_tokens, total_tokens, token_transaction_id, token_cost, brutto_coefficient_snapshot, created_at FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
  return Response.json({ generations: rows.results });
}
