import { requireGlobalAdmin, storage } from "@/lib/auth";
import { adminGenerationThumbnail } from "@/lib/admin-generation-image";
import { database } from "@/lib/server-runtime";
import { GENERATION_IMAGE_DELETED_MESSAGE } from "@/lib/storage-policy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireGlobalAdmin(request)) return new Response("Недостаточно прав.", { status: 403 });
  const { id } = await context.params;
  const generation = await database.prepare("SELECT output_key, content_type, image_deleted_at FROM generations WHERE id = ?").bind(id).first<{ output_key: string; content_type: string; image_deleted_at: string | null }>();
  if (!generation) return new Response("Не найдено.", { status: 404 });
  if (generation.image_deleted_at) return new Response(GENERATION_IMAGE_DELETED_MESSAGE, { status: 410 });
  const object = await storage().get(generation.output_key);
  if (!object) return new Response("Файл не найден.", { status: 404 });
  const variant = new URL(request.url).searchParams.get("variant");
  if (variant === "thumbnail") {
    try {
      const thumbnail = await adminGenerationThumbnail(object.body);
      return new Response(thumbnail, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" } });
    } catch {
      return new Response("Не удалось подготовить миниатюру.", { status: 422 });
    }
  }
  return new Response(object.body, { headers: { "Content-Type": generation.content_type, "Cache-Control": "private, max-age=300" } });
}
