import { roboflowKey } from "@/lib/server-config";
import { requireTenantUser } from "@/lib/auth";

type Polygon = number[][];
type Prediction = { masks?: Polygon[]; confidence?: number };
type RoboflowResponse = {
  predictions?: Prediction[];
  prompt_results?: Array<{ predictions?: Prediction[] }>;
  detail?: string;
  message?: string;
};

export async function POST(request: Request) {
  if (!await requireTenantUser(request)) return Response.json({ error: "Требуется tenant membership." }, { status: 403 });
  const token = roboflowKey();
  if (!token) return Response.json({ error: "Сервис точных контуров пока не настроен." }, { status: 503 });
  const body = await request.json() as { image?: string; x?: number; y?: number; width?: number; height?: number };
  if (!body.image || !Number.isFinite(body.x) || !Number.isFinite(body.y)) return Response.json({ error: "Не удалось определить точку на предмете." }, { status: 400 });
  const pointX = body.x as number;
  const pointY = body.y as number;

  try {
    const image = body.image.includes(",") ? body.image.slice(body.image.indexOf(",") + 1) : body.image;
    const response = await fetch(`https://serverless.roboflow.com/sam3/visual_segment?api_key=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: { type: "base64", value: image },
        image_id: crypto.randomUUID(),
        prompts: [{
          prompts: [{
            points: [{ positive: true, x: pointX, y: pointY }],
            ...(Number.isFinite(body.width) && Number.isFinite(body.height) ? { box: { x: Math.max(0, pointX - (body.width as number) / 2), y: Math.max(0, pointY - (body.height as number) / 2), width: body.width, height: body.height } } : {}),
          }],
        }],
        format: "json",
        sam2_version_id: "hiera_large",
        multimask_output: false,
        save_logits_to_cache: false,
        load_logits_from_cache: false,
      }),
    });
    const raw = await response.text();
    let payload: RoboflowResponse;
    try { payload = JSON.parse(raw) as RoboflowResponse; } catch { return Response.json({ error: "Сервис точных контуров вернул некорректный ответ." }, { status: 502 }); }
    if (!response.ok) return Response.json({ error: payload.detail || payload.message || "Не удалось запустить уточнение контура." }, { status: response.status });
    const predictions = payload.prompt_results?.flatMap((result) => result.predictions || []) || payload.predictions || [];
    const bestPrediction = [...predictions].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    const polygons = bestPrediction?.masks?.filter((polygon) => polygon.length >= 3) || [];
    if (!polygons.length) return Response.json({ error: "Не удалось выделить предмет. Выберите его на изображении ещё раз." }, { status: 422 });
    return Response.json({ polygons });
  } catch {
    return Response.json({ error: "Не удалось получить точный контур предмета." }, { status: 502 });
  }
}
