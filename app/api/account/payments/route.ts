import { currentUser, ensureStore } from "@/lib/auth";
import { createTokenPayment } from "@/lib/payments";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  await ensureStore();
  const [payments, packages] = await database.batch([
    database.prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id),
    database.prepare("SELECT * FROM token_packages WHERE active = 1 ORDER BY sort_order, price"),
  ]);
  return Response.json({ payments: payments.results, packages: packages.results });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  try {
    const body = await request.json() as { packageId?: string; rubles?: number; idempotencyKey?: string };
    const key = request.headers.get("Idempotency-Key") || body.idempotencyKey;
    if (!key) return Response.json({ error: "Нужен Idempotency-Key." }, { status: 400 });
    return Response.json({ payment: await createTokenPayment({ userId: user.id, idempotencyKey: `${user.id}:${key}`, packageId: body.packageId, rubles: body.rubles }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать платёж." }, { status: 400 });
  }
}
