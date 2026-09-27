import { requireGlobalAdmin } from "@/lib/auth";
import { assignPlanToUser } from "@/lib/billing";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireGlobalAdmin(request);
  if (!admin) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json() as { planCode?: string };
    const plan = await assignPlanToUser(admin.id, id, String(body.planCode || ""));
    return Response.json({ plan });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Тариф не назначен." }, { status: 400 });
  }
}
