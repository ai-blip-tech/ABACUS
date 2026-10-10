import { assignUserTenant } from "@/lib/admin";
import { requireGlobalAdmin } from "@/lib/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireGlobalAdmin(request);
  if (!admin) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json() as { tenantId?: string | null };
    if (body.tenantId !== null && body.tenantId !== undefined && typeof body.tenantId !== "string") return Response.json({ error: "Некорректный tenant." }, { status: 400 });
    return Response.json({ assignment: await assignUserTenant({ adminUserId: admin.id, userId: id, tenantId: body.tenantId || null }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Tenant не назначен." }, { status: 400 });
  }
}
