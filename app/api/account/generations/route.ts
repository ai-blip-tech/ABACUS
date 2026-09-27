import { currentUser, ensureStore } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  await ensureStore();
  const rows = await database.prepare("SELECT id, operation, project_id, project_name_snapshot, token_cost, created_at FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id).all<{ id: string; operation: string; project_id: string | null; project_name_snapshot: string | null; token_cost: number | null; created_at: string }>();
  return Response.json({ generations: rows.results.map((row) => ({ ...row, previewUrl: `/api/account/generations/${row.id}` })) });
}
