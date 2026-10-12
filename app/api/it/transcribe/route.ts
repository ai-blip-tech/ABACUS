import { openAIKey } from "@/lib/server-config";

const extensionFor = (type: string) => type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : "webm";

export async function POST(request: Request) {
  const apiKey = openAIKey();
  if (!apiKey) return Response.json({ error: "Транскрипция временно недоступна." }, { status: 503 });
  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof File) || !audio.size) return Response.json({ error: "Не удалось получить запись." }, { status: 400 });
    if (audio.size > 12 * 1024 * 1024) return Response.json({ error: "Голосовое сообщение слишком длинное." }, { status: 413 });

    const form = new FormData();
    form.append("file", audio, `message.${extensionFor(audio.type)}`);
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe");
    form.append("language", "ru");
    form.append("response_format", "json");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { error?: { code?: string; type?: string; param?: string; message?: string } };
      console.error("[It] Audio transcription failed", {
        status: response.status,
        code: failure.error?.code,
        type: failure.error?.type,
        param: failure.error?.param,
        message: failure.error?.message,
      });
      return Response.json({ error: "Не удалось распознать запись. Попробуйте ещё раз." }, { status: 502 });
    }
    const payload = await response.json() as { text?: string };
    const text = payload.text?.trim();
    if (!text) return Response.json({ error: "В записи не удалось распознать речь." }, { status: 422 });
    return Response.json({ text });
  } catch {
    return Response.json({ error: "Не удалось обработать голосовое сообщение." }, { status: 500 });
  }
}
