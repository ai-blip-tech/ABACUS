import { adminUserDetail } from "@/lib/admin";
import { requireGlobalAdmin } from "@/lib/auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  const { id } = await context.params;
  const user = await adminUserDetail(id);
  if (!user) return Response.json({ error: "Пользователь не найден." }, { status: 404 });
  return Response.json({ user });
}
