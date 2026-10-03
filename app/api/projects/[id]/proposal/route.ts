import { requireTenantUser } from "@/lib/auth";
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
    notes: text(source.notes, 2_000) || undefined,
  };
  return Object.values(override).some((entry) => entry !== undefined) ? override : undefined;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await params;
  if (!validProjectId(id)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
  const body = await request.json().catch(() => null) as { showPrices?: unknown; items?: unknown } | null;
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
  state.proposalShowPrices = body.showPrices !== false;
  await database.prepare("UPDATE projects SET state_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND user_id = ?")
    .bind(JSON.stringify(state), new Date().toISOString(), id, user.tenantId, user.id)
    .run();
  return Response.json({ ok: true });
}
