import { ensureAiCostLedgerStore } from "@/lib/ai-cost-ledger";
import { requireTenantUser } from "@/lib/auth";
import { imageModel } from "@/lib/image-model";
import { openAIKey } from "@/lib/server-config";
import { database } from "@/lib/server-runtime";
import { findTechnicalLightingOperation, TECHNICAL_LIGHTING_STUCK_AFTER_MS } from "@/lib/technical-lighting-operations";

export async function GET(request: Request) {
  const operationId = new URL(request.url).searchParams.get("operationId")?.trim();
  if (!operationId) {
    return Response.json({
      configured: Boolean(openAIKey()),
      provider: "OpenAI",
      model: imageModel(),
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(operationId)) {
    return Response.json({ error: "Некорректный идентификатор операции." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Требуется вход." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const operation = await findTechnicalLightingOperation({ userId: user.id, tenantId: user.tenantId }, operationId);
  if (!operation) return Response.json({ error: "Операция технического света не найдена." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const generation = await database.prepare(`
    SELECT id, image_deleted_at
    FROM generations
    WHERE id = ? AND user_id = ? AND tenant_id = ?
  `).bind(operationId, user.id, user.tenantId).first<{ id: string; image_deleted_at: string | null }>();
  if (generation && !generation.image_deleted_at) {
    return Response.json({
      status: "succeeded",
      operationId,
      imageUrl: `/api/account/generations/${encodeURIComponent(generation.id)}`,
      message: "Результат готов и сохранён.",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  await ensureAiCostLedgerStore();
  const ledger = await database.prepare(`
    SELECT status, error_code, created_at, updated_at, completed_at
    FROM ai_cost_ledger
    WHERE request_id = ? AND user_id = ? AND tenant_id = ?
  `).bind(operationId, user.id, user.tenantId).first<{
    status: string;
    error_code: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }>();
  const failed = Boolean(ledger && !["pending", "provider_succeeded", "succeeded"].includes(ledger.status));
  if (failed || generation?.image_deleted_at) {
    return Response.json({
      status: "failed",
      operationId,
      message: generation?.image_deleted_at
        ? "Результат операции был удалён по политике хранения. Новая генерация автоматически не запускалась."
        : "Генерация завершилась ошибкой. Повторный запрос провайдеру автоматически не отправлялся.",
      errorCode: ledger?.error_code || null,
    }, { headers: { "Cache-Control": "no-store" } });
  }
  const ageMs = Date.now() - new Date(operation.created_at).getTime();
  if (ageMs >= TECHNICAL_LIGHTING_STUCK_AFTER_MS) {
    return Response.json({
      status: "stuck",
      operationId,
      message: "Операция выполняется дольше четырёх минут и помечена как зависшая. Это не означает, что генерация прекратилась: поздний результат будет сохранён и доступен при следующей проверке. Повторный запрос провайдеру не отправлен.",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({
    status: "pending",
    operationId,
    message: ledger?.status === "provider_succeeded"
      ? "Генерация завершена у провайдера, сохраняем результат…"
      : "Генерация продолжается. Повторный запрос провайдеру не отправляется.",
  }, { headers: { "Cache-Control": "no-store" } });
}
