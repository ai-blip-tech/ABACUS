import { imageModel } from "@/lib/image-model";
import { openAIKey } from "@/lib/server-config";
import { currentUser } from "@/lib/auth";

type LayerRequest = { mode?: "background"; image?: string; mask?: string; outputSize?: string };

const dataUrlToBlob = (dataUrl: string) => {
  const [header, encoded] = dataUrl.split(",");
  const type = header?.match(/^data:([^;]+);base64$/)?.[1];
  if (!type || !encoded) throw new Error("Некорректный формат изображения.");
  return new Blob([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))], { type });
};

export async function POST(request: Request) {
  if (!await currentUser(request)) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const apiKey = openAIKey();
  if (!apiKey) return Response.json({ error: "Сервис слоёв пока не настроен." }, { status: 503 });
  const body = await request.json() as LayerRequest;
  if (!body.image || !body.mode) return Response.json({ error: "Не удалось подготовить изображение слоя." }, { status: 400 });
  const size = /^\d{3,4}x\d{3,4}$/.test(body.outputSize || "") ? body.outputSize! : "1024x1024";
  const prompt = "This is a LOCAL inpainting crop from one photograph. Edit ONLY pixels covered by the transparent area of the supplied mask: remove the selected object and reconstruct the immediately hidden background. Do not redesign, restyle, move, add, remove, crop, extend, relight, or reinterpret anything else. Preserve all visible pixels outside the transparent mask exactly, including architecture, horizon, furniture, people, plants, shadows, materials, perspective and camera framing. Return one opaque photorealistic image with the exact same crop framing. No text, logos or watermark.";
  try {
    const form = new FormData();
    form.append("model", imageModel());
    form.append("prompt", prompt);
    form.append("image[]", dataUrlToBlob(body.image), "interior.png");
    if (body.mask) form.append("mask", dataUrlToBlob(body.mask), "objects-mask.png");
    form.append("size", size);
    form.append("quality", "medium");
    form.append("output_format", "png");
    const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    const payload = await response.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
    if (!response.ok) return Response.json({ error: payload.error?.message || "Не удалось создать слой." }, { status: response.status });
    const image = payload.data?.[0]?.b64_json;
    if (!image) return Response.json({ error: "Слой не вернулся от модели." }, { status: 502 });
    return new Response(Uint8Array.from(atob(image), (char) => char.charCodeAt(0)), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось подготовить слой." }, { status: 400 });
  }
}
