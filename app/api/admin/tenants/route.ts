import { requireGlobalAdmin } from "@/lib/auth";
import { ensureStore } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureStore();
  const [tenants, memberships] = await database.batch([
    database.prepare(`SELECT tenants.*,
      (SELECT COUNT(*) FROM tenant_memberships WHERE tenant_memberships.tenant_id = tenants.id) AS member_count,
      (SELECT COUNT(*) FROM tenant_memberships WHERE tenant_memberships.tenant_id = tenants.id AND tenant_memberships.role IN ('admin', 'owner')) AS admin_count
      FROM tenants ORDER BY tenants.name`),
    database.prepare("SELECT tenant_memberships.tenant_id, tenant_memberships.role, tenant_memberships.created_at, users.id AS user_id, users.email, users.first_name, users.last_name FROM tenant_memberships JOIN users ON users.id = tenant_memberships.user_id ORDER BY users.email"),
  ]);
  return Response.json({ tenants: tenants.results.map((tenant) => ({ ...tenant, memberships: memberships.results.filter((membership) => membership.tenant_id === tenant.id) })) });
}
