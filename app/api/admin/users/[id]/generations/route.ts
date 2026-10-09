import { adminUserGenerations } from "@/lib/admin";
import { requireGlobalAdmin } from "@/lib/auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  const { id } = await context.params;
  const url = new URL(request.url);
  const result = await adminUserGenerations(id, Number(url.searchParams.get("offset") || 0), Number(url.searchParams.get("limit") || 24));
  if (!result) return Response.json({ error: "Пользователь не найден." }, { status: 404 });
  return Response.json(result);
}
