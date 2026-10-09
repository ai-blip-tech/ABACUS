import { currentUser, storage } from "@/lib/auth";
import { database } from "@/lib/server-runtime";
import { GENERATION_IMAGE_DELETED_MESSAGE } from "@/lib/storage-policy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser(request);
  if (!user) return new Response("Требуется вход.", { status: 401 });
  const { id } = await context.params;
  const generation = await database.prepare("SELECT output_key, content_type, image_deleted_at FROM generations WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(id, user.tenantId, user.id).first<{ output_key: string; content_type: string; image_deleted_at: string | null }>();
  if (!generation) return new Response("Не найдено.", { status: 404 });
  if (generation.image_deleted_at) return new Response(GENERATION_IMAGE_DELETED_MESSAGE, { status: 410 });
  const object = await storage().get(generation.output_key);
  if (!object) return new Response("Файл не найден.", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": generation.content_type, "Cache-Control": "private, max-age=300" } });
}
