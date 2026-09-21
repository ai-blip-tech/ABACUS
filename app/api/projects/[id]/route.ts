import { env } from "cloudflare:workers";
import { currentUser, ensureStore, storage, tenantStoragePrefix } from "@/lib/auth";

type SavedHistoryItem = { id: string; name: string; generated: boolean; asset: string };
type SavedPlanParameter = { name: string; value: string };
type SavedPlanItem = {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
  rugShape?: "rectangular" | "round";
  referenceAsset?: string;
  referenceImage?: string;
  referenceImages?: string[];
  referenceName?: string;
  referenceProductId?: string;
  referenceArticle?: string;
  referenceUrl?: string;
  referencePrice?: number;
  referenceOldPrice?: number;
  referenceCategory?: string;
  referenceSubtype?: string;
  referenceColor?: string;
  referenceMaterial?: string;
  referenceHeightMm?: number | null;
  referenceDescription?: string;
  referenceParameters?: SavedPlanParameter[];
};
type SavedSurfaceReference = { name: string; asset?: string; image?: string };
type SavedPlanCamera = { x: number; y: number; height: number; rotation: number };
type SavedState = {
  version: number;
  interiorAsset?: string;
  generatedAsset?: string;
  interiorName?: string;
  canvasRatio?: number;
  generated?: boolean;
  activeHistoryId?: string | null;
  historyVersions?: SavedHistoryItem[];
  prompt?: string;
  preserved?: string[];
  creativity?: string;
  planItems?: SavedPlanItem[];
  planRoom?: { width: number; length: number };
  planFloorReference?: SavedSurfaceReference | null;
  planWallReference?: SavedSurfaceReference | null;
  planCamera?: SavedPlanCamera | null;
};

const validProjectId = (id: string) => /^[a-zA-Z0-9-]{12,100}$/.test(id);
const validAsset = (asset: string) => /^[a-zA-Z0-9-]{1,80}$/.test(asset);
const assetKey = (tenantPrefix: string, projectId: string, asset: string) => `${tenantPrefix}/projects/${projectId}/${asset}`;
const assetUrl = (projectId: string, asset: string) => `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset)}`;

function hydrateState(projectId: string, state: SavedState) {
  return {
    ...state,
    interiorImage: state.interiorAsset ? assetUrl(projectId, state.interiorAsset) : "",
    generatedImage: state.generatedAsset ? assetUrl(projectId, state.generatedAsset) : "",
    historyVersions: (state.historyVersions || []).map((version) => ({ ...version, image: assetUrl(projectId, version.asset) })),
    planItems: (state.planItems || []).map(({ referenceAsset, ...item }) => ({
      ...item,
      referenceImage: referenceAsset ? assetUrl(projectId, referenceAsset) : item.referenceImage,
    })),
    planFloorReference: state.planFloorReference ? {
      name: state.planFloorReference.name,
      image: state.planFloorReference.asset ? assetUrl(projectId, state.planFloorReference.asset) : state.planFloorReference.image || "",
    } : null,
    planWallReference: state.planWallReference ? {
      name: state.planWallReference.name,
      image: state.planWallReference.asset ? assetUrl(projectId, state.planWallReference.asset) : state.planWallReference.image || "",
    } : null,
  };
}

function dataUrlToBytes(value: string) {
  const match = value.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("Не удалось сохранить изображение проекта.");
  const binary = atob(match[2]);
  return { contentType: match[1], bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
}

const finiteNumber = (value: unknown, fallback: number, minimum = -Infinity, maximum = Infinity) => typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
const shortText = (value: unknown, maximum = 240) => typeof value === "string" ? value.slice(0, maximum) : "";
const storedImageUrl = (value: unknown) => typeof value === "string" && (/^https?:\/\//i.test(value) || value.startsWith("/api/projects/")) ? value.slice(0, 4000) : undefined;
const planSurfaceReference = (value: unknown, asset: string, collectImage: (asset: string, image: unknown) => void): SavedSurfaceReference | null => {
  if (!value || typeof value !== "object") return null;
  const reference = value as Record<string, unknown>;
  collectImage(asset, reference.image);
  const image = storedImageUrl(reference.image);
  return { name: shortText(reference.name, 200) || "Референс", ...(typeof reference.image === "string" && reference.image.startsWith("data:") ? { asset } : image ? { image } : {}) };
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await params;
  if (!validProjectId(id)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
  const project = await env.DB.prepare("SELECT id, name, project_type, description, created_at, updated_at, state_json FROM projects WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(id, user.tenantId, user.id).first<{ id: string; name: string; project_type: string; description: string | null; created_at: string; updated_at: string; state_json: string | null }>();
  if (!project || !project.state_json) return Response.json({ error: "Сохранённый проект не найден." }, { status: 404 });
  try {
    return Response.json({ project: { ...project, state_json: undefined }, state: hydrateState(id, JSON.parse(project.state_json) as SavedState) });
  } catch {
    return Response.json({ error: "Не удалось прочитать сохранённый проект." }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  await ensureStore();
  const { id } = await params;
  if (!validProjectId(id)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
  const body = await request.json().catch(() => null) as { name?: unknown; projectType?: unknown; description?: unknown; state?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const projectType = typeof body?.projectType === "string" ? body.projectType.trim().slice(0, 80) : "Квартира";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : "";
  if (!name || !body?.state || typeof body.state !== "object") return Response.json({ error: "Не удалось подготовить проект к сохранению." }, { status: 400 });
  const draft = body.state as Record<string, unknown>;
  const images = new Map<string, string>();
  const collectImage = (asset: string, image: unknown) => { if (typeof image === "string" && image.startsWith("data:")) images.set(asset, image); };
  collectImage("interior", draft.interiorImage);
  collectImage("current", draft.generatedImage);
  const historyInput = Array.isArray(draft.historyVersions) ? draft.historyVersions.slice(-8) : [];
  const historyVersions: SavedHistoryItem[] = historyInput.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const asset = `history-${index}`;
    collectImage(asset, item.image);
    return [{ id: typeof item.id === "string" ? item.id.slice(0, 120) : crypto.randomUUID(), name: typeof item.name === "string" ? item.name.slice(0, 160) : "Визуализация", generated: Boolean(item.generated), asset }];
  });
  const planItems: SavedPlanItem[] = (Array.isArray(draft.planItems) ? draft.planItems.slice(0, 100) : []).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const referenceAsset = `plan-item-${index}`;
    collectImage(referenceAsset, item.referenceImage);
    const referenceImage = storedImageUrl(item.referenceImage);
    const parameters: SavedPlanParameter[] = (Array.isArray(item.referenceParameters) ? item.referenceParameters.slice(0, 40) : []).flatMap((parameter) => {
      if (!parameter || typeof parameter !== "object") return [];
      const candidate = parameter as Record<string, unknown>;
      const name = shortText(candidate.name, 160);
      const value = shortText(candidate.value, 600);
      return name && value ? [{ name, value }] : [];
    });
    return [{
      id: shortText(item.id, 120) || crypto.randomUUID(),
      kind: shortText(item.kind, 40) || "decor",
      name: shortText(item.name, 240) || "Предмет",
      x: finiteNumber(item.x, 0, 0, 100),
      y: finiteNumber(item.y, 0, 0, 100),
      width: finiteNumber(item.width, 500, 50, 20000),
      depth: finiteNumber(item.depth, 500, 50, 20000),
      rotation: finiteNumber(item.rotation, 0, 0, 360),
      ...(item.rugShape === "round" || item.rugShape === "rectangular" ? { rugShape: item.rugShape } : {}),
      ...(typeof item.referenceImage === "string" && item.referenceImage.startsWith("data:") ? { referenceAsset } : referenceImage ? { referenceImage } : {}),
      referenceImages: (Array.isArray(item.referenceImages) ? item.referenceImages : []).map(storedImageUrl).filter((image): image is string => Boolean(image)).slice(0, 20),
      referenceName: shortText(item.referenceName, 240) || undefined,
      referenceProductId: shortText(item.referenceProductId, 160) || undefined,
      referenceArticle: shortText(item.referenceArticle, 160) || undefined,
      referenceUrl: storedImageUrl(item.referenceUrl),
      referencePrice: typeof item.referencePrice === "number" && Number.isFinite(item.referencePrice) ? item.referencePrice : undefined,
      referenceOldPrice: typeof item.referenceOldPrice === "number" && Number.isFinite(item.referenceOldPrice) ? item.referenceOldPrice : undefined,
      referenceCategory: shortText(item.referenceCategory, 240) || undefined,
      referenceSubtype: shortText(item.referenceSubtype, 240) || undefined,
      referenceColor: shortText(item.referenceColor, 240) || undefined,
      referenceMaterial: shortText(item.referenceMaterial, 400) || undefined,
      referenceHeightMm: item.referenceHeightMm === null ? null : typeof item.referenceHeightMm === "number" && Number.isFinite(item.referenceHeightMm) ? item.referenceHeightMm : undefined,
      referenceDescription: shortText(item.referenceDescription, 5000) || undefined,
      referenceParameters: parameters.length ? parameters : undefined,
    }];
  });
  const planRoomInput = draft.planRoom && typeof draft.planRoom === "object" ? draft.planRoom as Record<string, unknown> : {};
  const planRoom = { width: finiteNumber(planRoomInput.width, 6000, 500, 30000), length: finiteNumber(planRoomInput.length, 4500, 500, 30000) };
  const planFloorReference = planSurfaceReference(draft.planFloorReference, "plan-floor", collectImage);
  const planWallReference = planSurfaceReference(draft.planWallReference, "plan-wall", collectImage);
  const cameraInput = draft.planCamera && typeof draft.planCamera === "object" ? draft.planCamera as Record<string, unknown> : null;
  const planCamera: SavedPlanCamera | null = cameraInput ? {
    x: finiteNumber(cameraInput.x, 50, 0, 100),
    y: finiteNumber(cameraInput.y, 50, 0, 100),
    height: finiteNumber(cameraInput.height, 1500, 300, 3000),
    rotation: finiteNumber(cameraInput.rotation, 0, -360, 360),
  } : null;
  if (!images.size) return Response.json({ error: "Добавьте интерьер перед сохранением проекта." }, { status: 400 });
  try {
    await Promise.all([...images.entries()].map(async ([asset, image]) => {
      if (!validAsset(asset)) throw new Error("Некорректный ресурс проекта.");
      const file = dataUrlToBytes(image);
      await storage().put(assetKey(tenantStoragePrefix(user), id, asset), file.bytes, { httpMetadata: { contentType: file.contentType }, customMetadata: { projectId: id, userId: user.id, tenantId: user.tenantId } });
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить изображения проекта." }, { status: 500 });
  }
  const state: SavedState = {
    version: 1,
    interiorAsset: images.has("interior") ? "interior" : undefined,
    generatedAsset: images.has("current") ? "current" : undefined,
    interiorName: typeof draft.interiorName === "string" ? draft.interiorName.slice(0, 200) : "Интерьер",
    canvasRatio: typeof draft.canvasRatio === "number" && Number.isFinite(draft.canvasRatio) ? draft.canvasRatio : 16 / 9,
    generated: Boolean(draft.generated),
    activeHistoryId: typeof draft.activeHistoryId === "string" ? draft.activeHistoryId.slice(0, 120) : null,
    historyVersions,
    prompt: typeof draft.prompt === "string" ? draft.prompt.slice(0, 4000) : "",
    preserved: Array.isArray(draft.preserved) ? draft.preserved.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
    creativity: typeof draft.creativity === "string" ? draft.creativity.slice(0, 80) : "Средняя",
    planItems,
    planRoom,
    planFloorReference,
    planWallReference,
    planCamera,
  };
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(id, user.tenantId, user.id).first();
  if (existing) {
    await env.DB.prepare("UPDATE projects SET name = ?, project_type = ?, description = ?, state_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(name, projectType || "Квартира", description || null, JSON.stringify(state), now, id, user.tenantId, user.id).run();
  } else {
    await env.DB.prepare("INSERT INTO projects (id, user_id, tenant_id, name, project_type, description, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, user.id, user.tenantId, name, projectType || "Квартира", description || null, JSON.stringify(state), now, now).run();
  }
  return Response.json({ project: { id, name, project_type: projectType || "Квартира", description, created_at: now, updated_at: now }, state: hydrateState(id, state) });
}
