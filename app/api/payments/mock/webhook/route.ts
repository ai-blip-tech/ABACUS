import { timingSafeEqual } from "node:crypto";

import { finalizePaymentWebhook } from "@/lib/payments";

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(request: Request) {
  const configured = process.env.PAYMENT_MOCK_WEBHOOK_SECRET || "";
  const supplied = request.headers.get("x-webhook-secret") || "";
  if (!configured || !safeEqual(configured, supplied)) return Response.json({ error: "Webhook не авторизован." }, { status: 401 });
  try {
    return Response.json({ payment: await finalizePaymentWebhook("mock", await request.text()) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Webhook не обработан." }, { status: 400 });
  }
}
