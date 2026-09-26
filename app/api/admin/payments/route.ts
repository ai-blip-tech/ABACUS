import { ensureStore, requireGlobalAdmin } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureStore();
  const payments = await database.prepare("SELECT payments.*, users.email FROM payments JOIN users ON users.id = payments.user_id ORDER BY payments.created_at DESC LIMIT 500").all();
  return Response.json({ payments: payments.results });
}
