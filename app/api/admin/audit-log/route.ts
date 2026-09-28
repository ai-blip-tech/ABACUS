import { requireGlobalAdmin } from "@/lib/auth";
import { ensureBillingStore } from "@/lib/billing";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureBillingStore();
  const rows = await database.prepare(`SELECT audit_logs.*, actor.email AS admin_email, target.email AS target_user_email
    FROM audit_logs LEFT JOIN users actor ON actor.id = audit_logs.actor_user_id
    LEFT JOIN users target ON audit_logs.entity_type = 'user' AND target.id = audit_logs.entity_id
    ORDER BY audit_logs.created_at DESC LIMIT 500`).all();
  return Response.json({ entries: rows.results });
}
