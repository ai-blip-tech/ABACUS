import { requireGlobalAdmin } from "@/lib/auth";
import { transferTokens } from "@/lib/billing";

export async function POST(request: Request) {
  const admin = await requireGlobalAdmin(request);
  if (!admin) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const body = await request.json() as { sourceUserId?: string; targetUserId?: string; amount?: number; reason?: string; idempotencyKey?: string };
    const key = request.headers.get("Idempotency-Key") || body.idempotencyKey;
    if (!body.sourceUserId || !body.targetUserId || !key) return Response.json({ error: "Заполните source, target и Idempotency-Key." }, { status: 400 });
    const transfer = await transferTokens({ sourceUserId: body.sourceUserId, targetUserId: body.targetUserId, amount: Number(body.amount), adminUserId: admin.id, reason: body.reason?.slice(0, 500), idempotencyKey: `${admin.id}:${key}` });
    return Response.json({ transfer }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Перевод не выполнен." }, { status: 400 });
  }
}
