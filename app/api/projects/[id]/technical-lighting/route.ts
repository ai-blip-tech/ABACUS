import { ensureStore, requireTenantUser, storage, tenantStoragePrefix } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

type ProjectRow = { id: string; name: string; project_type: string; state_json: string | null };
type JsonObject = Record<string, unknown>;

const validProjectId = (id: string) => /^[a-zA-Z0-9-]{12,100}$/.test(id);
const shortText = (value: unknown, maximum = 240) => typeof value === "string" ? value.slice(0, maximum) : "";
const finiteNumber = (value: unknown, fallback: number, minimum = -Infinity, maximum = Infinity) => typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
const storedImageUrl = (value: unknown) => typeof value === "string" && (/^https:\/\//i.test(value) || value.startsWith("/api/projects/")) ? value.slice(0, 4000) : "";
const assetKey = (prefix: string, projectId: string, asset: string) => `${prefix}/projects/${projectId}/${asset}`;
const assetUrl = (projectId: string, asset: string) => `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset)}`;

function dataUrlToBytes(value: string) {
  const match = value.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("Не удалось сохранить изображение технического света.");
  const binary = atob(match[2]);
  return { contentType: match[1], bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
}

function sanitizeProduct(value: unknown, referenceAssets: Map<string, string>) {
  const product = value && typeof value === "object" ? value as JsonObject : {};
  const id = shortText(product.id, 180) || crypto.randomUUID();
  const specs = product.specs && typeof product.specs === "object" ? product.specs as JsonObject : {};
  const rawImage = shortText(product.image, 15_000_000);
  const image = storedImageUrl(rawImage);
  let referenceAsset = "";
  if (rawImage.startsWith("data:")) {
    referenceAsset = `technical-reference-${referenceAssets.size}`;
    referenceAssets.set(referenceAsset, rawImage);
  }
  const type = ["track", "track_fixture", "fixture", "power", "accessory"].includes(String(product.type)) ? String(product.type) : "fixture";
  return {
    id,
    article: shortText(product.article, 160),
    name: shortText(product.name, 240) || "Светильник",
    image,
    referenceAsset,
    price: finiteNumber(product.price, 0, 0),
    available: product.available !== false,
    categoryTrail: shortText(product.categoryTrail, 500),
    type,
    isReference: Boolean(product.isReference),
    specs: {
      powerW: typeof specs.powerW === "number" ? finiteNumber(specs.powerW, 0, 0) : null,
      voltageV: typeof specs.voltageV === "number" ? finiteNumber(specs.voltageV, 0, 0) : null,
      cctK: typeof specs.cctK === "number" ? finiteNumber(specs.cctK, 0, 0) : null,
      beamDeg: typeof specs.beamDeg === "number" ? finiteNumber(specs.beamDeg, 0, 0) : null,
      widthMm: typeof specs.widthMm === "number" ? finiteNumber(specs.widthMm, 0, 0, 20000) : null,
      lengthMm: typeof specs.lengthMm === "number" ? finiteNumber(specs.lengthMm, 0, 0, 20000) : null,
    },
  };
}

function hydrate(projectId: string, value: unknown) {
  if (!value || typeof value !== "object") return null;
  const lighting = structuredClone(value) as JsonObject;
  if (typeof lighting.photoAsset === "string" && lighting.photoAsset) lighting.photo = assetUrl(projectId, lighting.photoAsset);
  const hydrateProducts = (items: unknown) => Array.isArray(items) ? items.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const item = entry as JsonObject;
    const product = item.product && typeof item.product === "object" ? item.product as JsonObject : null;
    if (product?.referenceAsset) product.image = assetUrl(projectId, String(product.referenceAsset));
    return item;
  }) : [];
  lighting.tracks = hydrateProducts(lighting.tracks);
  lighting.fixtures = hydrateProducts(lighting.fixtures);
  return lighting;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await params;
  if (!validProjectId(id)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
  const project = await database.prepare("SELECT id, name, project_type, state_json FROM projects WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(id, user.tenantId, user.id).first<ProjectRow>();
  if (!project) return Response.json({ error: "Проект не найден." }, { status: 404 });
  let state: JsonObject = {};
  try { state = project.state_json ? JSON.parse(project.state_json) as JsonObject : {}; } catch { /* an unreadable legacy state can still receive lighting data */ }
  return Response.json({ project: { id: project.id, name: project.name, project_type: project.project_type }, technicalLighting: hydrate(id, state.technicalLighting) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  await ensureStore();
  const { id } = await params;
  if (!validProjectId(id)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
  const project = await database.prepare("SELECT id, name, project_type, state_json FROM projects WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(id, user.tenantId, user.id).first<ProjectRow>();
  if (!project) return Response.json({ error: "Проект не найден." }, { status: 404 });
  const body = await request.json().catch(() => null) as { technicalLighting?: unknown } | null;
  if (!body?.technicalLighting || typeof body.technicalLighting !== "object") return Response.json({ error: "Не удалось подготовить технический свет к сохранению." }, { status: 400 });
  const input = body.technicalLighting as JsonObject;
  const referenceAssets = new Map<string, string>();
  const products = new Map<string, ReturnType<typeof sanitizeProduct>>();
  const productFor = (value: unknown) => {
    const raw = value && typeof value === "object" ? value as JsonObject : {};
    const key = shortText(raw.id, 180) || crypto.randomUUID();
    if (!products.has(key)) products.set(key, sanitizeProduct({ ...raw, id: key }, referenceAssets));
    return products.get(key)!;
  };
  const point = (value: unknown) => {
    const candidate = value && typeof value === "object" ? value as JsonObject : {};
    return { x: finiteNumber(candidate.x, 50, 0, 100), y: finiteNumber(candidate.y, 50, 0, 100) };
  };
  const tracks = (Array.isArray(input.tracks) ? input.tracks : []).slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const track = entry as JsonObject;
    const points = Array.isArray(track.points) ? track.points : [];
    return [{ id: shortText(track.id, 120) || crypto.randomUUID(), points: [point(points[0]), point(points[1])], product: productFor(track.product), lengthMm: finiteNumber(track.lengthMm, 2000, 1, 20000), rotation: finiteNumber(track.rotation, 0, 0, 359) }];
  });
  const fixtures = (Array.isArray(input.fixtures) ? input.fixtures : []).slice(0, 300).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const fixture = entry as JsonObject;
    return [{ id: shortText(fixture.id, 120) || crypto.randomUUID(), point: point(fixture.point), product: productFor(fixture.product), trackId: shortText(fixture.trackId, 120) || undefined }];
  });
  const roomInput = input.room && typeof input.room === "object" ? input.room as JsonObject : {};
  const photo = shortText(input.photo, 25_000_000);
  const photoAsset = photo.startsWith("data:") ? "technical-current" : "";
  try {
    const pending = new Map(referenceAssets);
    if (photoAsset) pending.set(photoAsset, photo);
    await Promise.all([...pending.entries()].map(async ([asset, image]) => {
      const file = dataUrlToBytes(image);
      await storage().put(assetKey(tenantStoragePrefix(user), id, asset), file.bytes, { httpMetadata: { contentType: file.contentType }, customMetadata: { projectId: id, userId: user.id, tenantId: user.tenantId } });
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить изображения технического света." }, { status: 500 });
  }
  let state: JsonObject = {};
  try { state = project.state_json ? JSON.parse(project.state_json) as JsonObject : {}; } catch { /* replace only unreadable state metadata */ }
  const technicalLighting = {
    version: 1,
    room: { width: finiteNumber(roomInput.width, 6000, 1000, 20000), length: finiteNumber(roomInput.length, 4500, 1000, 20000) },
    tracks,
    fixtures,
    photoAsset: photoAsset || undefined,
    photo: photoAsset ? undefined : storedImageUrl(photo),
    photoName: shortText(input.photoName, 240),
    photoRatio: finiteNumber(input.photoRatio, 16 / 9, 0.3, 4),
    cctK: finiteNumber(input.cctK, 3000, 1000, 10000),
    timeOfDay: input.timeOfDay === "night" ? "night" : "day",
    updatedAt: new Date().toISOString(),
  };
  state = { ...state, version: typeof state.version === "number" ? state.version : 1, technicalLighting };
  const now = new Date().toISOString();
  await database.prepare("UPDATE projects SET state_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(JSON.stringify(state), now, id, user.tenantId, user.id).run();
  return Response.json({ project: { id: project.id, name: project.name, project_type: project.project_type, updated_at: now }, technicalLighting: hydrate(id, technicalLighting) });
}
