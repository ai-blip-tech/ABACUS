import { requireTenantUser, storage, tenantStoragePrefix } from "@/lib/auth";

type StoredTemplateAsset = {
  id: string;
  templateId: string;
  name: string;
  contentType: string;
  bytes: number;
  createdAt: string;
};

const MANIFEST_VERSION = 1;
const MAX_ASSETS = 500;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const safeTemplateId = (value: unknown) => typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value) ? value : "";
const manifestKey = (prefix: string) => `${prefix}/template-assets/manifest.json`;
const assetKey = (prefix: string, id: string) => `${prefix}/template-assets/files/${id}`;

async function readManifest(prefix: string): Promise<StoredTemplateAsset[]> {
  const object = await storage().get(manifestKey(prefix));
  if (!object) return [];
  try {
    const parsed = JSON.parse(new TextDecoder().decode(object.body)) as { version?: number; assets?: StoredTemplateAsset[] };
    return parsed.version === MANIFEST_VERSION && Array.isArray(parsed.assets) ? parsed.assets : [];
  } catch {
    return [];
  }
}

async function writeManifest(prefix: string, assets: StoredTemplateAsset[]) {
  const body = new TextEncoder().encode(JSON.stringify({ version: MANIFEST_VERSION, assets: assets.slice(0, MAX_ASSETS) }));
  await storage().put(manifestKey(prefix), body, { httpMetadata: { contentType: "application/json" } });
}

function dataUrlToImage(value: unknown) {
  if (typeof value !== "string") throw new Error("Не удалось прочитать изображение.");
  const match = value.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || !imageTypes.has(match[1])) throw new Error("Поддерживаются изображения JPG, PNG и WEBP.");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Изображение превышает допустимый размер.");
  return { contentType: match[1], bytes };
}

const publicAsset = (asset: StoredTemplateAsset) => ({
  ...asset,
  sourceUrl: `/api/account/template-assets/${encodeURIComponent(asset.id)}`,
});

export async function GET(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const templateId = safeTemplateId(new URL(request.url).searchParams.get("templateId"));
  const assets = await readManifest(tenantStoragePrefix(user));
  return Response.json({ assets: assets.filter((asset) => !templateId || asset.templateId === templateId).map(publicAsset) });
}

export async function POST(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const body = await request.json().catch(() => null) as { templateId?: unknown; name?: unknown; dataUrl?: unknown; clientId?: unknown } | null;
  const templateId = safeTemplateId(body?.templateId);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 240) : "";
  if (!templateId || !name) return Response.json({ error: "Не удалось подготовить изображение." }, { status: 400 });
  try {
    const image = dataUrlToImage(body?.dataUrl);
    const prefix = tenantStoragePrefix(user);
    const asset: StoredTemplateAsset = {
      id: typeof body?.clientId === "string" && /^[a-f0-9-]{36}$/.test(body.clientId) ? body.clientId : crypto.randomUUID(),
      templateId,
      name,
      contentType: image.contentType,
      bytes: image.bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
    await storage().put(assetKey(prefix, asset.id), image.bytes, {
      httpMetadata: { contentType: asset.contentType },
      customMetadata: { templateId, userId: user.id, tenantId: user.tenantId },
    });
    await writeManifest(prefix, [asset, ...(await readManifest(prefix)).filter((entry) => entry.id !== asset.id)]);
    return Response.json({ asset: publicAsset(asset) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить изображение." }, { status: 400 });
  }
}
