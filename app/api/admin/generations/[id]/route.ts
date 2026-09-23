import { requireAdmin, storage } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) return new Response("Недостаточно прав.", { status: 403 });
  const { id } = await context.params;
  const generation = await database.prepare("SELECT output_key, content_type FROM generations WHERE id = ? AND tenant_id = ?").bind(id, admin.tenantId).first<{ output_key: string; content_type: string }>();
  if (!generation) return new Response("Не найдено.", { status: 404 });
  const object = await storage().get(generation.output_key);
  if (!object) return new Response("Файл не найден.", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": generation.content_type, "Cache-Control": "private, max-age=300" } });
}
