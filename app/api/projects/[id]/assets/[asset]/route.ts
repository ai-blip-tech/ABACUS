import { currentUser, storage, tenantStoragePrefix } from "@/lib/auth";

const valid = (value: string) => /^[a-zA-Z0-9-]{1,100}$/.test(value);

export async function GET(request: Request, { params }: { params: Promise<{ id: string; asset: string }> }) {
  const user = await currentUser(request);
  if (!user) return new Response("Требуется вход.", { status: 401 });
  const { id, asset } = await params;
  if (!valid(id) || !valid(asset)) return new Response("Некорректный ресурс.", { status: 400 });
  const object = await storage().get(`${tenantStoragePrefix(user)}/projects/${id}/${asset}`)
    || await storage().get(`projects/${user.id}/${id}/${asset}`);
  if (!object) return new Response("Изображение не найдено.", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}
