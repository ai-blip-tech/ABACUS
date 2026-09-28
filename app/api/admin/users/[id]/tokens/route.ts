import { requireGlobalAdmin } from "@/lib/auth";
import { adjustUserTokens } from "@/lib/admin";
import { getTokenAccount, getTokenHistory } from "@/lib/billing";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  const { id } = await context.params;
  const [account, transactions] = await Promise.all([getTokenAccount(id), getTokenHistory(id)]);
  return Response.json({ account, transactions });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireGlobalAdmin(request);
  if (!admin) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json() as { direction?: "credit" | "debit"; amount?: number; reason?: string; idempotencyKey?: string };
    const key = request.headers.get("Idempotency-Key") || body.idempotencyKey;
    if (!key || !["credit", "debit"].includes(body.direction || "")) return Response.json({ error: "Укажите тип операции и Idempotency-Key." }, { status: 400 });
    const transaction = await adjustUserTokens({ adminUserId: admin.id, userId: id, direction: body.direction!, amount: Number(body.amount), reason: body.reason || "", idempotencyKey: key });
    return Response.json({ transaction }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Операция не выполнена." }, { status: 400 });
  }
}
