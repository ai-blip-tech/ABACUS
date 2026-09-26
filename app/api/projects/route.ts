import { ensureStore, requireTenantUser } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const projects = await database.prepare("SELECT id, name, project_type, description, created_at, updated_at FROM projects WHERE tenant_id = ? AND user_id = ? AND state_json IS NOT NULL ORDER BY updated_at DESC LIMIT 24").bind(user.tenantId, user.id).all();
  return Response.json({ projects: projects.results });
}

export async function POST(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  await ensureStore();
  const body = await request.json().catch(() => ({})) as { name?: unknown; projectType?: unknown; description?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const projectType = typeof body.projectType === "string" ? body.projectType.trim().slice(0, 80) : "Квартира";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
  if (!name) return Response.json({ error: "Введите название проекта." }, { status: 400 });
  const project = { id: crypto.randomUUID(), name, project_type: projectType || "Квартира", description, created_at: new Date().toISOString() };
  await database.prepare("INSERT INTO projects (id, user_id, tenant_id, name, project_type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(project.id, user.id, user.tenantId, project.name, project.project_type, project.description || null, project.created_at, project.created_at).run();
  return Response.json({ project });
}
