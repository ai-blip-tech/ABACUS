import { creditTokens, ensureBillingStore, getGlobalSettings, payloadHash, quoteTokenPurchase } from "./billing.ts";
import { database } from "./server-runtime.ts";

export type PaymentStatus = "pending" | "processing" | "paid" | "failed" | "canceled" | "refunded" | "partially_refunded";
export type PaymentProvider = {
  createPayment(input: { paymentId: string; amount: number; currency: string; description: string }): Promise<{ externalPaymentId: string; status: PaymentStatus; confirmationUrl?: string }>;
  getPaymentStatus(externalPaymentId: string): Promise<PaymentStatus>;
  handleWebhook(payload: string): Promise<{ externalEventId: string; externalPaymentId: string; status: PaymentStatus; eventType: string }>;
  refundPayment(externalPaymentId: string, amount?: number): Promise<{ status: PaymentStatus }>;
  createCustomer(input: { userId: string; email: string }): Promise<{ externalCustomerId: string }>;
  cancelSubscription(externalSubscriptionId: string): Promise<{ canceled: boolean }>;
};

export const mockPaymentProvider: PaymentProvider = {
  async createPayment(input) { return { externalPaymentId: `mock_${input.paymentId}`, status: "pending", confirmationUrl: `/account?mockPayment=${input.paymentId}` }; },
  async getPaymentStatus() { return "pending"; },
  async handleWebhook(payload) {
    const event = JSON.parse(payload) as { eventId?: string; paymentId?: string; status?: PaymentStatus; type?: string };
    if (!event.eventId || !event.paymentId || !event.status) throw new Error("Некорректный mock webhook.");
    return { externalEventId: event.eventId, externalPaymentId: `mock_${event.paymentId}`, status: event.status, eventType: event.type || "payment.updated" };
  },
  async refundPayment() { return { status: "refunded" }; },
  async createCustomer(input) { return { externalCustomerId: `mock_customer_${input.userId}` }; },
  async cancelSubscription() { return { canceled: true }; },
};

export function paymentProvider(name = process.env.PAYMENT_PROVIDER || "mock") {
  if (name === "mock") return mockPaymentProvider;
  throw new Error(`Платёжный провайдер ${name} не настроен.`);
}

export async function createTokenPayment(input: { userId: string; idempotencyKey: string; packageId?: string; rubles?: number }) {
  await ensureBillingStore();
  const duplicate = await database.prepare("SELECT * FROM payments WHERE idempotency_key = ?").bind(input.idempotencyKey).first();
  if (duplicate) return duplicate;
  let quote: { amountKopecks: number; currency: string; tokenAmount: number; exchangeRate: number };
  let packageId: string | null = null;
  if (input.packageId) {
    const tokenPackage = await database.prepare("SELECT id, price, currency, token_amount FROM token_packages WHERE id = ? AND active = 1").bind(input.packageId).first<{ id: string; price: number; currency: string; token_amount: number }>();
    if (!tokenPackage) throw new Error("Пакет токенов не найден.");
    const settings = await getGlobalSettings();
    quote = { amountKopecks: tokenPackage.price, currency: tokenPackage.currency, tokenAmount: tokenPackage.token_amount, exchangeRate: settings.token_exchange_rate };
    packageId = tokenPackage.id;
  } else {
    const settings = await getGlobalSettings();
    if (!settings.custom_token_purchase_enabled) throw new Error("Покупка произвольной суммы отключена.");
    quote = await quoteTokenPurchase(Number(input.rubles || 0));
  }
  const id = crypto.randomUUID();
  const providerName = process.env.PAYMENT_PROVIDER || "mock";
  const provider = paymentProvider(providerName);
  const now = new Date().toISOString();
  const reservation = database.transaction((sqlite) => {
    const existing = sqlite.prepare("SELECT * FROM payments WHERE idempotency_key = ?").get(input.idempotencyKey);
    if (existing) return { created: false, payment: existing };
    sqlite.prepare("INSERT INTO payments (id, user_id, provider, amount, currency, status, purpose, token_package_id, token_amount, exchange_rate_snapshot, idempotency_key, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, 'processing', 'token_purchase', ?, ?, ?, ?, ?, '{}')")
      .run(id, input.userId, providerName, quote.amountKopecks, quote.currency, packageId, quote.tokenAmount, quote.exchangeRate, input.idempotencyKey, now);
    return { created: true, payment: null };
  });
  if (!reservation.created) return reservation.payment;
  try {
    const created = await provider.createPayment({ paymentId: id, amount: quote.amountKopecks, currency: quote.currency, description: "Покупка токенов Room Design" });
    await database.prepare("UPDATE payments SET external_payment_id = ?, status = ?, metadata_json = ? WHERE id = ?")
      .bind(created.externalPaymentId, created.status, JSON.stringify({ confirmationUrl: created.confirmationUrl ?? null }), id).run();
  } catch (error) {
    await database.prepare("UPDATE payments SET status = 'failed', failed_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
    throw error;
  }
  return database.prepare("SELECT * FROM payments WHERE id = ?").bind(id).first();
}

export async function processPaymentWebhook(providerName: string, rawPayload: string) {
  await ensureBillingStore();
  const provider = paymentProvider(providerName);
  const event = await provider.handleWebhook(rawPayload);
  return database.transaction((sqlite) => {
    const duplicate = sqlite.prepare("SELECT payment_id FROM payment_events WHERE provider = ? AND external_event_id = ?").get(providerName, event.externalEventId) as { payment_id: string } | undefined;
    if (duplicate) return sqlite.prepare("SELECT * FROM payments WHERE id = ?").get(duplicate.payment_id);
    const payment = sqlite.prepare("SELECT * FROM payments WHERE provider = ? AND external_payment_id = ?").get(providerName, event.externalPaymentId) as { id: string; user_id: string; status: string; token_amount: number } | undefined;
    if (!payment) throw new Error("Платёж не найден.");
    const now = new Date().toISOString();
    const effectiveStatus = payment.status === "paid" && ["pending", "processing", "failed", "canceled"].includes(event.status) ? "paid" : event.status;
    sqlite.prepare("INSERT INTO payment_events (id, payment_id, provider, external_event_id, event_type, payload_hash, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), payment.id, providerName, event.externalEventId, event.eventType, payloadHash(rawPayload), now, now);
    sqlite.prepare("UPDATE payments SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, ?) ELSE paid_at END, failed_at = CASE WHEN ? = 'failed' THEN COALESCE(failed_at, ?) ELSE failed_at END WHERE id = ?")
      .run(effectiveStatus, effectiveStatus, now, effectiveStatus, now, payment.id);
    return { ...payment, status: effectiveStatus };
  });
}

export async function finalizePaymentWebhook(providerName: string, rawPayload: string) {
  const result = await processPaymentWebhook(providerName, rawPayload) as { id: string; user_id: string; token_amount: number; status: PaymentStatus };
  // The ledger idempotency key is the source of truth. Crediting on every paid
  // delivery also recovers safely if the process stopped after saving the event.
  if (result.status === "paid") {
    await creditTokens({ userId: result.user_id, type: "purchase", amount: result.token_amount, referenceType: "payment", referenceId: result.id, description: "Покупка токенов", idempotencyKey: `payment-credit:${result.id}` });
  }
  return database.prepare("SELECT * FROM payments WHERE id = ?").bind(result.id).first();
}
