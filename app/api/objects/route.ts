import { openAIKey } from "@/lib/server-config";
import { ensureStore, requireTenantUser } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

type ObjectResponse = {
  id?: string;
  status?: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "incomplete";
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
  incomplete_details?: { reason?: string };
};

const schema = { type: "object", properties: { objects: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, polygon: { type: "array", minItems: 3, maxItems: 40, items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } } }, required: ["id", "name", "x", "y", "width", "height", "polygon"], additionalProperties: false } } }, required: ["objects"], additionalProperties: false };
const apiHeaders = (apiKey: string) => ({ "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" });

export async function POST(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const apiKey = openAIKey();
  if (!apiKey) return Response.json({ error: "Сервис распознавания пока не настроен." }, { status: 503 });
  const { image } = await request.json() as { image?: string };
  if (!image) return Response.json({ error: "Сначала загрузите изображение интерьера." }, { status: 400 });
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: apiHeaders(apiKey), body: JSON.stringify({ model: "gpt-5", background: true, input: [{ role: "user", content: [{ type: "input_text", text: "Analyse this interior as a compositing scene. Return only 3–6 large, clearly visible, independently editable foreground elements: furniture, a large artwork, a large plant, or a person if they overlap furniture. Exclude architecture, walls, windows, curtains, shadows, tiny decor, books, and partial/background fragments. For every element return a short Russian name, a tight bounding rectangle, and a tight closed polygon that follows the visible silhouette of THAT element only. The polygon must have 12–32 points whenever the outline is non-rectangular. x, y, width, height and every polygon point use percentages (0–100) of the FULL ORIGINAL IMAGE. Never include another object, floor, wall, or background inside a polygon. If a person sits on a sofa, return the person separately and keep the sofa polygon to only visible sofa pixels." }, { type: "input_image", image_url: image, detail: "high" }] }], text: { format: { type: "json_schema", name: "interior_layer_objects", strict: true, schema } } }) });
    const result = await response.json() as ObjectResponse;
    if (!response.ok || !result.id) return Response.json({ error: result.error?.message || "Не удалось запустить распознавание." }, { status: response.status || 502 });
    await ensureStore();
    await database.prepare("INSERT OR REPLACE INTO ai_jobs (id, tenant_id, user_id, kind, created_at) VALUES (?, ?, ?, 'objects', ?)").bind(result.id, user.tenantId, user.id, new Date().toISOString()).run();
    return Response.json({ id: result.id, status: result.status || "queued" }, { status: 202 });
  } catch { return Response.json({ error: "Не удалось подключиться к сервису распознавания. Попробуйте ещё раз." }, { status: 502 }); }
}

export async function GET(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const apiKey = openAIKey();
  const id = new URL(request.url).searchParams.get("id");
  if (!apiKey || !id) return Response.json({ error: "Не удалось проверить статус распознавания." }, { status: 400 });
  await ensureStore();
  const ownedJob = await database.prepare("SELECT id FROM ai_jobs WHERE id = ? AND tenant_id = ? AND user_id = ? AND kind = 'objects'").bind(id, user.tenantId, user.id).first();
  if (!ownedJob) return Response.json({ error: "Задача распознавания не найдена." }, { status: 404 });
  try {
    const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(id)}`, { headers: apiHeaders(apiKey) });
    const result = await response.json() as ObjectResponse;
    if (!response.ok) return Response.json({ error: result.error?.message || "Не удалось проверить статус распознавания." }, { status: response.status });
    if (result.status !== "completed") {
      if (result.status === "failed" || result.status === "cancelled" || result.status === "incomplete") return Response.json({ status: result.status, error: result.error?.message || result.incomplete_details?.reason || "Распознавание не завершилось." });
      return Response.json({ status: result.status || "in_progress" });
    }
    const outputText = result.output_text || result.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("") || "{}";
    const parsed = JSON.parse(outputText);
    await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(id)}`, { method: "DELETE", headers: apiHeaders(apiKey) });
    await database.prepare("DELETE FROM ai_jobs WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(id, user.tenantId, user.id).run();
    return Response.json({ status: "completed", objects: parsed.objects || [] });
  } catch { return Response.json({ error: "Не удалось получить результат распознавания." }, { status: 502 }); }
}
