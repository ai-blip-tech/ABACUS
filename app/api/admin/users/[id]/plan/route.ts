import { assignUserPlan } from "@/lib/admin";
import { requireGlobalAdmin } from "@/lib/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireGlobalAdmin(request);
  if (!admin) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json() as { planId?: string };
    if (!body.planId) return Response.json({ error: "Выберите тариф." }, { status: 400 });
    return Response.json({ subscription: await assignUserPlan({ adminUserId: admin.id, userId: id, planId: body.planId }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Тариф не назначен." }, { status: 400 });
  }
}
