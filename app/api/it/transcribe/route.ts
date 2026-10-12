import { currentUser, tenantForRequest } from "@/lib/auth";
import { beginOnoFinancialUsage, completeOnoFinancialUsage, type OnoTextUsage } from "@/lib/it/finance";
import { onoVisitorCookie, resolveOnoConversation } from "@/lib/it/memory";
import { isTrustedOnoRequestSource, onoSiteConfigFor } from "@/lib/it/site-config";
import { resolveOnoTenantProfile } from "@/lib/it/tenant-profiles";
import { onoServerEnabled } from "@/lib/it/version";
import { openAIKey } from "@/lib/server-config";

const extensionFor = (type: string) => type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : "webm";
const validRequestId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type TranscriptionPayload = {
  text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

export async function POST(request: Request) {
  if (!onoServerEnabled()) return Response.json({ error: "ОНО временно отключено." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const apiKey = openAIKey();
  if (!apiKey) return Response.json({ error: "Транскрипция временно недоступна." }, { status: 503 });
  let requestId = "";
  let model = "";
  let financeStarted = false;
  let financeCompleted = false;
  const emptyUsage: OnoTextUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 1 };

  const finishFinance = async (status: "succeeded" | "failed", usage: OnoTextUsage, usageKnown: boolean, errorCode?: string) => {
    if (!financeStarted || financeCompleted) return;
    financeCompleted = true;
    await completeOnoFinancialUsage({
      requestId,
      model,
      status,
      usage,
      usageKnown,
      endpoint: "openai.audio.transcriptions",
      errorCode,
    });
  };

  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    requestId = String(incoming.get("requestId") || "");
    const requestedSessionId = String(incoming.get("sessionId") || "") || null;
    if (!validRequestId(requestId)) return Response.json({ error: "Некорректный идентификатор запроса." }, { status: 400 });
    if (!(audio instanceof File) || !audio.size) return Response.json({ error: "Не удалось получить запись." }, { status: 400 });
    if (audio.size > 12 * 1024 * 1024) return Response.json({ error: "Голосовое сообщение слишком длинное." }, { status: 413 });

    const profile = resolveOnoTenantProfile(request.headers.get("host") || new URL(request.url).host);
    const config = onoSiteConfigFor(profile.siteId);
    if (!isTrustedOnoRequestSource(config, request)) return Response.json({ error: "Источник запроса не разрешён." }, { status: 403 });
    const [tenant, user] = await Promise.all([tenantForRequest(request), currentUser(request)]);
    const conversation = await resolveOnoConversation({ request, tenantId: tenant.id, siteId: profile.siteId, user, requestedSessionId });
    model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe";
    financeStarted = await beginOnoFinancialUsage({
      requestId,
      sessionId: conversation.session.id,
      userId: user?.id || null,
      visitorId: conversation.visitorId,
      tenantId: user?.tenantId || tenant.id,
      siteId: profile.siteId,
      model,
      operationType: "ono_transcription",
      endpoint: "openai.audio.transcriptions",
    });
    if (!financeStarted) return Response.json({ error: "Этот голосовой запрос уже обработан." }, { status: 409 });

    const form = new FormData();
    form.append("file", audio, `message.${extensionFor(audio.type)}`);
    form.append("model", model);
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
      await finishFinance("failed", emptyUsage, false, failure.error?.code || `http_${response.status}`);
      return Response.json({ error: "Не удалось распознать запись. Попробуйте ещё раз." }, { status: 502 });
    }
    const payload = await response.json() as TranscriptionPayload;
    const text = payload.text?.trim();
    const usageKnown = Number.isFinite(payload.usage?.input_tokens) && Number.isFinite(payload.usage?.output_tokens);
    const usage: OnoTextUsage = {
      inputTokens: Number(payload.usage?.input_tokens || 0),
      outputTokens: Number(payload.usage?.output_tokens || 0),
      totalTokens: Number(payload.usage?.total_tokens || 0),
      calls: 1,
    };
    if (!text) {
      await finishFinance("failed", usage, usageKnown, "empty_transcription");
      return Response.json({ error: "В записи не удалось распознать речь." }, { status: 422 });
    }
    await finishFinance("succeeded", usage, usageKnown);
    const headers = conversation.setVisitorCookie ? { "Set-Cookie": onoVisitorCookie(conversation.visitorId) } : undefined;
    return Response.json({ text, sessionId: conversation.session.id }, { headers });
  } catch (error) {
    await finishFinance("failed", emptyUsage, false, error instanceof Error ? error.name : "transcription_error");
    return Response.json({ error: "Не удалось обработать голосовое сообщение." }, { status: 500 });
  }
}
