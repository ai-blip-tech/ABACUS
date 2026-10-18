import { currentUser, ensureStore } from "@/lib/auth";
import { loadFurnitureCatalog } from "@/lib/furniture-catalog";
import { loadLightingCatalog } from "@/lib/lighting-catalog";
import { buildPersonalCatalogDashboard } from "@/lib/personal-catalog-dashboard";
import { database } from "@/lib/server-runtime";

const INPUT_USD_PER_MILLION = 8;
const OUTPUT_USD_PER_MILLION = 30;

type ProjectState = {
  interiorAsset?: string;
  generatedAsset?: string;
  historyVersions?: Array<{ asset?: string }>;
};

const validAsset = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);

function projectPreviewUrl(projectId: string, stateJson: unknown, updatedAt: unknown) {
  if (typeof stateJson !== "string") return null;
  try {
    const state = JSON.parse(stateJson) as ProjectState;
    const latestHistoryAsset = Array.isArray(state.historyVersions) ? state.historyVersions.at(-1)?.asset : undefined;
    const asset = state.generatedAsset || latestHistoryAsset || state.interiorAsset;
    const version = typeof updatedAt === "string" ? `?v=${encodeURIComponent(updatedAt)}` : "";
    return validAsset(asset) ? `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset)}${version}` : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  await ensureStore();
  const [projects, summary, generations] = await database.batch([
    database.prepare("SELECT id, name, project_type, description, state_json, created_at, updated_at FROM projects WHERE tenant_id = ? AND user_id = ? ORDER BY updated_at DESC").bind(user.tenantId, user.id),
    database.prepare(`SELECT COUNT(*) AS generation_count, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(total_tokens), 0) AS total_tokens, (COALESCE(SUM(input_tokens), 0) * ${INPUT_USD_PER_MILLION} + COALESCE(SUM(output_tokens), 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0 AS cost_usd FROM generations WHERE tenant_id = ? AND user_id = ?`).bind(user.tenantId, user.id),
    database.prepare(`SELECT id, operation, created_at, total_tokens, image_deleted_at, image_deletion_reason, (COALESCE(input_tokens, 0) * ${INPUT_USD_PER_MILLION} + COALESCE(output_tokens, 0) * ${OUTPUT_USD_PER_MILLION}) / 1000000.0 AS cost_usd FROM generations WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 8`).bind(user.tenantId, user.id),
  ]);
  const [furnitureCatalog, lightingCatalog] = await Promise.allSettled([loadFurnitureCatalog(), loadLightingCatalog()]);
  const projectRows = projects.results.map((project) => ({
    id: String(project.id),
    updated_at: typeof project.updated_at === "string" ? project.updated_at : null,
    state_json: project.state_json,
  }));
  const dashboard = buildPersonalCatalogDashboard({
    projects: projectRows,
    furnitureProducts: furnitureCatalog.status === "fulfilled" ? furnitureCatalog.value.products : [],
    lightingProducts: lightingCatalog.status === "fulfilled" ? lightingCatalog.value : [],
    catalogAvailable: furnitureCatalog.status === "fulfilled" || lightingCatalog.status === "fulfilled",
  });
  return Response.json({
    user,
    projects: projects.results.map(({ state_json, ...project }) => ({
      ...project,
      preview_image: projectPreviewUrl(String(project.id), state_json, project.updated_at),
    })),
    summary: summary.results[0] || {},
    generations: generations.results,
    dashboard,
  });
}
