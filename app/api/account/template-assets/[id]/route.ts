import { requireTenantUser, storage, tenantStoragePrefix } from "@/lib/auth";

const validId = (value: string) => /^[a-f0-9-]{36}$/.test(value);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireTenantUser(request);
  if (!user) return new Response("Требуется вход.", { status: 401 });
  const { id } = await params;
  if (!validId(id)) return new Response("Некорректный ресурс.", { status: 400 });
  const object = await storage().get(`${tenantStoragePrefix(user)}/template-assets/files/${id}`);
  if (!object) return new Response("Изображение не найдено.", { status: 404 });
  const headers = new Headers({ "Cache-Control": "private, max-age=3600", ETag: object.httpEtag });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
