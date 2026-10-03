import { ensureStore, requireTenantUser, storage, tenantStoragePrefix } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

const validProjectId = (id: string) => /^[a-zA-Z0-9-]{12,100}$/.test(id);
const text = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const number = (value: unknown, maximum: number) => typeof value === "number" && Number.isFinite(value)
  ? Math.max(0, Math.min(maximum, value))
  : undefined;

function cleanOverride(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const override = {
    name: text(source.name, 240) || undefined,
    width: number(source.width, 20_000),
    depth: number(source.depth, 20_000),
    height: number(source.height, 20_000),
    price: number(source.price, 1_000_000_000),
    quantity: number(source.quantity, 10_000),
    article: text(source.article, 160) || undefined,
    category: text(source.category, 240) || undefined,
    brand: text(source.brand, 240) || undefined,
    configuration: text(source.configuration, 800) || undefined,
    option: text(source.option, 800) || undefined,
    characteristics: Array.isArray(source.characteristics) ? source.characteristics.slice(0, 4).map((entry) => text(entry, 600)) : undefined,
    notes: text(source.notes, 2_000) || undefined,
  };
  return Object.values(override).some((entry) => entry !== undefined) ? override : undefined;
}

function cleanDocument(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const limits: Record<string, number> = {
    clientName: 120, projectName: 140, offerNumber: 60, offerDate: 40, validUntil: 40,
    selectionCount: 80, categories: 400, principle: 800, cityObject: 240, summaryNote: 1000,
    leadTime: 500, delivery: 500, payment: 500, managerRole: 120, managerPhone: 80, managerEmail: 200,
  };
  return Object.fromEntries(Object.entries(limits).map(([key, limit]) => [key, text(source[key], limit)]));
}

function dataUrlToBytes(value: string) {
  const match = value.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("Не удалось сохранить выбранную визуализацию.");
  const binary = atob(match[2]);
  return { contentType: match[1], bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await params;
  if (!validProjectId(id)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
  const body = await request.json().catch(() => null) as { showPrices?: unknown; items?: unknown; visualization?: unknown; document?: unknown } | null;
  if (!body || !Array.isArray(body.items)) return Response.json({ error: "Некорректные данные коммерческого предложения." }, { status: 400 });
  const project = await database.prepare("SELECT state_json FROM projects WHERE id = ? AND tenant_id = ? AND user_id = ?")
    .bind(id, user.tenantId, user.id)
    .first<{ state_json: string | null }>();
  if (!project?.state_json) return Response.json({ error: "Сохранённый проект не найден." }, { status: 404 });

  const requested = new Map<string, unknown>();
  for (const entry of body.items.slice(0, 100)) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const objectId = text(candidate.id, 120);
    if (objectId) requested.set(objectId, candidate.proposalOverride);
  }
  const state = JSON.parse(project.state_json) as Record<string, unknown>;
  const planItems = Array.isArray(state.planItems) ? state.planItems : [];
  state.planItems = planItems.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const item = entry as Record<string, unknown>;
    const objectId = typeof item.id === "string" ? item.id : "";
    if (!requested.has(objectId)) return item;
    const proposalOverride = cleanOverride(requested.get(objectId));
    const rest = { ...item };
    delete rest.proposalOverride;
    return proposalOverride ? { ...rest, proposalOverride } : rest;
  });
  if (typeof body.showPrices === "boolean") state.proposalShowPrices = body.showPrices;
  const document = cleanDocument(body.document);
  if (document) state.proposalDocument = document;
  if (typeof body.visualization === "string" && body.visualization) {
    try {
      await ensureStore();
      const file = dataUrlToBytes(body.visualization);
      const asset = "proposal-visualization";
      await storage().put(`${tenantStoragePrefix(user)}/projects/${id}/${asset}`, file.bytes, {
        httpMetadata: { contentType: file.contentType },
        customMetadata: { projectId: id, userId: user.id, tenantId: user.tenantId },
      });
      state.proposalVisualizationAsset = asset;
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить выбранную визуализацию." }, { status: 500 });
    }
  }
  await database.prepare("UPDATE projects SET state_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND user_id = ?")
    .bind(JSON.stringify(state), new Date().toISOString(), id, user.tenantId, user.id)
    .run();
  return Response.json({ ok: true });
}
