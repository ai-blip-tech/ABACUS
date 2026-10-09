import { requireGlobalAdmin, storage } from "@/lib/auth";
import { adminGenerationThumbnail } from "@/lib/admin-generation-image";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireGlobalAdmin(request)) return new Response("Недостаточно прав.", { status: 403 });
  const { id } = await context.params;
  const generation = await database.prepare("SELECT output_key, content_type FROM generations WHERE id = ?").bind(id).first<{ output_key: string; content_type: string }>();
  if (!generation) return new Response("Не найдено.", { status: 404 });
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
