import { runItTurn, type ConversationInput } from "@/lib/it/core";
import { runOnoAgentConversation, type OnoModelRequest, type OnoModelResponse } from "@/lib/it/agent";
import { executeOnoTool } from "@/lib/it/catalog-tools";
import { validateRoomDesignContext } from "@/lib/it/context-validation";
import { beginOnoFinancialUsage, completeOnoFinancialUsage, type OnoTextUsage } from "@/lib/it/finance";
import { deleteOnoConversation, loadOnoContext, loadOnoMessages, onoVisitorCookie, resolveOnoConversation, saveOnoTurn, storedOnoReply } from "@/lib/it/memory";
import { isTrustedOnoRequestSource, onoSiteConfigFor } from "@/lib/it/site-config";
import { resolveOnoTenantProfile, type OnoTenantProfile } from "@/lib/it/tenant-profiles";
import { recordOnoQualityEvent } from "@/lib/it/quality";
import { encodeOnoStreamEvent, onoProgressEvent, splitOnoTextForStreaming, type OnoProgressStage, type OnoStreamEvent } from "@/lib/it/stream";
import type { ItRequest } from "@/lib/it/types";
import { currentUser, tenantForRequest } from "@/lib/auth";
import { openAIKey } from "@/lib/server-config";
import { ONO_CORE_VERSION, onoServerEnabled } from "@/lib/it/version";

const modelName = () => process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-6.1-sol";
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 20;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const activeRequestIds = new Set<string>();

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    message: { type: "string" },
    selectedProductIds: { type: "array", items: { type: "string" }, maxItems: 10 },
    handoffRequested: { type: "boolean" },
    visionAnalysis: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            subject: { type: "string", enum: ["room", "furniture", "material", "unknown"] },
            categories: { type: "array", items: { type: "string" }, maxItems: 8 },
            colors: { type: "array", items: { type: "string" }, maxItems: 8 },
            materials: { type: "array", items: { type: "string" }, maxItems: 8 },
            styles: { type: "array", items: { type: "string" }, maxItems: 8 },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            uncertain: { type: "array", items: { type: "string" }, maxItems: 8 },
            requiresConfirmation: { type: "boolean" },
          },
          required: ["subject", "categories", "colors", "materials", "styles", "confidence", "uncertain", "requiresConfirmation"],
        },
      ],
    },
    sources: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
  },
  required: ["message", "selectedProductIds", "handoffRequested", "visionAnalysis", "sources"],
} as const;

const clientAddress = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")?.trim()
  || "local";

const withinRateLimit = (key: string) => {
  const now = Date.now();
  if (requestBuckets.size > 1_000) {
    for (const [bucketKey, value] of requestBuckets) if (value.resetAt <= now) requestBuckets.delete(bucketKey);
  }
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_REQUESTS) return false;
  bucket.count += 1;
  return true;
};

async function callOpenAI(request: OnoModelRequest, signal?: AbortSignal): Promise<OnoModelResponse> {
  const apiKey = openAIKey();
  if (!apiKey) return { output: [] };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName(),
      store: false,
      max_output_tokens: 900,
      reasoning: { effort: "low" },
      instructions: request.instructions,
      input: request.input,
      tools: request.tools,
      ...(request.include?.length ? { include: request.include } : {}),
      tool_choice: "auto",
      parallel_tool_calls: false,
      text: { format: { type: "json_schema", name: "ono_response", strict: true, schema: responseSchema } },
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { code?: string; type?: string } };
    console.error("[Ono] Responses API rejected the request", { status: response.status, code: error.error?.code, type: error.error?.type });
    throw new Error("Модель временно недоступна.");
  }
  const payload = await response.json() as OnoModelResponse;
  return { id: payload.id, output: Array.isArray(payload.output) ? payload.output : [], usage: payload.usage };
}

const safeToolArgumentsForLog = (value: unknown) => {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    category: input.category,
    subtype: input.subtype,
    color: input.color,
    material: input.material,
    style: input.style,
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    dimensions: input.dimensions,
    brand: input.brand,
    availability: input.availability,
    sort: input.sort,
    page: input.page,
    pageSize: input.pageSize,
    textQueryPresent: typeof input.textQuery === "string" && input.textQuery.trim().length > 0,
  };
};

async function answerConversation(
  input: ConversationInput,
  profile: OnoTenantProfile,
  requestId: string,
  observe: (usage: OnoTextUsage, state: Record<string, unknown>) => void,
  onProgress?: (stage: OnoProgressStage) => void,
  signal?: AbortSignal,
) {
  let activeState: Record<string, unknown> = { ...(input.memoryState || {}) };
  const result = await runOnoAgentConversation(input, profile, {
    callModel: (modelRequest) => callOpenAI(modelRequest, signal),
    executeTool: (name, argumentsValue) => executeOnoTool(name, argumentsValue, profile),
    onToolCall: (event) => {
      if (event.status === "success" && event.name === "search_catalog") activeState = { ...activeState, catalogSearch: safeToolArgumentsForLog(event.argumentsValue) };
      console.info("[ono-tool]", JSON.stringify({
        requestId,
        tenantId: profile.tenantId,
        siteId: profile.siteId,
        model: modelName(),
        tool: event.name,
        arguments: safeToolArgumentsForLog(event.argumentsValue),
        durationMs: event.durationMs,
        status: event.status,
        resultCount: event.resultCount,
      }));
    },
    onProgress,
  });
  if (result.visionAnalysis) activeState = { ...activeState, visionAnalysis: result.visionAnalysis };
  observe(result.modelUsage, activeState);
  console.info("[ono-usage]", JSON.stringify({ requestId, tenantId: profile.tenantId, siteId: profile.siteId, model: modelName(), ...result.modelUsage }));
  return result;
}

const responseHeaders = (setVisitorCookie: boolean, visitorId: string, requestId?: string) => ({
  "Cache-Control": "no-store",
  "X-Ono-Core-Version": ONO_CORE_VERSION,
  ...(setVisitorCookie ? { "Set-Cookie": onoVisitorCookie(visitorId) } : {}),
  ...(requestId ? { "X-Ono-Request-Id": requestId } : {}),
});

async function conversationForRequest(request: Request, requestedSessionId?: string | null) {
  const profile = resolveOnoTenantProfile(request.headers.get("host") || new URL(request.url).host);
  const config = onoSiteConfigFor(profile.siteId);
  if (!isTrustedOnoRequestSource(config, request)) throw new Error("Источник виджета не разрешён.");
  const [tenant, user] = await Promise.all([tenantForRequest(request), currentUser(request)]);
  const conversation = await resolveOnoConversation({ request, tenantId: tenant.id, siteId: profile.siteId, user, requestedSessionId });
  return { profile, config, tenant, user, ...conversation };
}

export async function GET(request: Request) {
  if (!onoServerEnabled()) return Response.json({ error: "ОНО временно отключено." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const requestedSessionId = new URL(request.url).searchParams.get("sessionId");
    const conversation = await conversationForRequest(request, requestedSessionId);
    const messages = await loadOnoMessages(conversation.session.id);
    return Response.json({
      sessionId: conversation.session.id,
      retentionDays: conversation.config.retentionDays,
      messages,
    }, { headers: responseHeaders(conversation.setVisitorCookie, conversation.visitorId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось открыть диалог." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  if (!onoServerEnabled()) return Response.json({ error: "ОНО временно отключено." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
    const conversation = await conversationForRequest(request, sessionId);
    await deleteOnoConversation(conversation.session.id, conversation.tenant.id, conversation.user, conversation.visitorId);
    const next = await resolveOnoConversation({ request, tenantId: conversation.tenant.id, siteId: conversation.profile.siteId, user: conversation.user });
    return Response.json({ sessionId: next.session.id, messages: [] }, { headers: responseHeaders(next.setVisitorCookie, next.visitorId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось начать новый диалог." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!onoServerEnabled()) return Response.json({ error: "ОНО временно отключено." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  let requestId = crypto.randomUUID();
  let financeStarted = false;
  let usage: OnoTextUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };
  const requestStartedAt = Date.now();
  let firstResponseMs: number | null = null;
  let activeRequestKey = "";
  try {
    const raw = await request.json() as ItRequest;
    requestId = /^[0-9a-f-]{36}$/i.test(raw.requestId || "") ? String(raw.requestId) : requestId;
    const conversation = await conversationForRequest(request, raw.sessionId);
    const { profile, tenant, user, session, visitorId, setVisitorCookie } = conversation;
    const rateLimitKey = `${tenant.id}:${user?.id || visitorId}:${clientAddress(request)}`;
    if (!withinRateLimit(rateLimitKey)) {
      return Response.json({ error: "Слишком много запросов. Подождите несколько минут." }, { status: 429 });
    }
    const body = { ...raw, context: validateRoomDesignContext(raw.context) };
    if (!body.message?.trim() || !body.context) {
      return Response.json({ error: "Нужны сообщение и контекст сайта." }, { status: 400 });
    }
    if (body.image && (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(body.image) || body.image.length > 12_000_000)) {
      return Response.json({ error: "Изображение должно быть PNG, JPEG или WebP размером до 8 МБ." }, { status: 413 });
    }
    const wantsStream = request.headers.get("accept")?.includes("application/x-ndjson") === true;
    const duplicate = await storedOnoReply(session.id, requestId);
    if (duplicate) {
      const duplicateTurn = { text: duplicate.text, products: duplicate.products, state: duplicate.products.length ? "success" : "speaking", sessionId: session.id } as const;
      if (!wantsStream) return Response.json(duplicateTurn, { headers: responseHeaders(setVisitorCookie, visitorId, requestId) });
      return new Response(`${encodeOnoStreamEvent(onoProgressEvent("accepted", Date.now() - requestStartedAt))}${encodeOnoStreamEvent({ type: "result", turn: duplicateTurn, sessionId: session.id, requestId, timing: { firstEventMs: Date.now() - requestStartedAt, totalMs: Date.now() - requestStartedAt } })}`, {
        headers: { ...responseHeaders(setVisitorCookie, visitorId, requestId), "Content-Type": "application/x-ndjson; charset=utf-8" },
      });
    }
    activeRequestKey = `${session.id}:${requestId}`;
    if (activeRequestIds.has(activeRequestKey)) return Response.json({ error: "Этот запрос уже выполняется." }, { status: 409, headers: { "Retry-After": "2" } });
    activeRequestIds.add(activeRequestKey);
    const memory = await loadOnoContext(session);
    body.history = memory.messages;
    body.memorySummary = memory.summary;
    body.memoryState = memory.state;
    const financeClaimed = await beginOnoFinancialUsage({ requestId, sessionId: session.id, userId: user?.id || null, visitorId, tenantId: tenant.id, siteId: profile.siteId, model: modelName() });
    if (!financeClaimed) {
      activeRequestIds.delete(activeRequestKey);
      return Response.json({ error: "Этот запрос уже выполняется или был учтён." }, { status: 409, headers: { "Retry-After": "2", ...responseHeaders(setVisitorCookie, visitorId, requestId) } });
    }
    financeStarted = true;
    let activeState = memory.state;
    const executeTurn = async (onProgress?: (stage: OnoProgressStage) => void, signal?: AbortSignal) => {
      const turn = await runItTurn(body, {
        answerConversation: (input) => answerConversation(input, profile, requestId, (observedUsage, observedState) => {
          usage = observedUsage;
          activeState = observedState;
        }, onProgress, signal),
      });
      const succeeded = turn.state !== "error";
      await completeOnoFinancialUsage({ requestId, model: modelName(), status: succeeded ? "succeeded" : "failed", usage, errorCode: succeeded ? null : "model_unavailable" });
      await saveOnoTurn({ session, requestId, userText: body.message.trim(), imagePresent: Boolean(body.image), assistantText: turn.text, products: turn.products, state: activeState });
      await recordOnoQualityEvent({
        requestId,
        tenantId: tenant.id,
        siteId: profile.siteId,
        status: succeeded ? "succeeded" : "failed",
        requestKind: request.headers.get("x-ono-test-run") === "1" ? "test" : "real",
        imagePresent: Boolean(body.image),
        firstResponseMs,
        durationMs: Date.now() - requestStartedAt,
        modelCalls: usage.calls,
        toolTrace: turn.toolTrace || [],
        productCount: turn.products?.length || 0,
        handoffRequested: turn.handoffRequested === true,
        visionConfidence: turn.visionAnalysis?.confidence || null,
        visionRequiresConfirmation: turn.visionAnalysis?.requiresConfirmation || false,
        webSearchEnabled: profile.capabilities.webSearch,
      }).catch((qualityError) => console.error("[Ono] quality metric failed", { requestId, message: qualityError instanceof Error ? qualityError.message : "unknown" }));
      return turn;
    };

    if (!wantsStream) {
      try {
        const turn = await executeTurn();
        return Response.json({ ...turn, sessionId: session.id }, { headers: responseHeaders(setVisitorCookie, visitorId, requestId) });
      } finally {
        activeRequestIds.delete(activeRequestKey);
      }
    }

    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: OnoStreamEvent) => {
          if (abortController.signal.aborted) return;
          if (firstResponseMs === null) firstResponseMs = Date.now() - requestStartedAt;
          controller.enqueue(encoder.encode(encodeOnoStreamEvent(event)));
        };
        try {
          emit(onoProgressEvent("accepted", Date.now() - requestStartedAt));
          const turn = await executeTurn((stage) => emit(onoProgressEvent(stage, Date.now() - requestStartedAt)), abortController.signal);
          emit(onoProgressEvent("finalizing", Date.now() - requestStartedAt));
          for (const delta of splitOnoTextForStreaming(turn.text)) {
            if (abortController.signal.aborted) break;
            emit({ type: "text_delta", delta });
            await new Promise((resolve) => setTimeout(resolve, 6));
          }
          emit({ type: "result", turn, sessionId: session.id, requestId, timing: { firstEventMs: firstResponseMs || 0, totalMs: Date.now() - requestStartedAt } });
          controller.close();
        } catch (error) {
          const message = error instanceof Error && error.name === "AbortError" ? "Запрос отменён." : error instanceof Error ? error.message : "Не удалось ответить.";
          if (!abortController.signal.aborted) {
            emit({ type: "error", message, requestId });
            controller.close();
          }
          if (financeStarted) await completeOnoFinancialUsage({ requestId, model: modelName(), status: "failed", usage, errorCode: abortController.signal.aborted ? "request_cancelled" : "request_failed" }).catch(() => undefined);
        } finally {
          activeRequestIds.delete(activeRequestKey);
        }
      },
      cancel() { abortController.abort(); },
    });
    return new Response(stream, {
      headers: {
        ...responseHeaders(setVisitorCookie, visitorId, requestId),
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (activeRequestKey) activeRequestIds.delete(activeRequestKey);
    const message = error instanceof Error ? error.message : "Не удалось ответить.";
    if (financeStarted) await completeOnoFinancialUsage({ requestId, model: modelName(), status: "failed", usage, errorCode: "request_failed" }).catch(() => undefined);
    console.error("[Ono] request failed", { requestId, message });
    return Response.json({ error: message }, { status: 500, headers: { "X-Ono-Request-Id": requestId } });
  }
}
