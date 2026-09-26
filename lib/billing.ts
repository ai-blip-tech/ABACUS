import { createHash } from "node:crypto";

import { database } from "./server-runtime.ts";

export type TokenTransactionType = "purchase" | "generation" | "refund" | "transfer_in" | "transfer_out" | "subscription_credit" | "correction";
export type GlobalSettings = {
  token_exchange_rate: number;
  brutto_coefficient: number;
  usd_to_rub_rate: number;
  token_charging_enabled: boolean;
  custom_token_purchase_enabled: boolean;
};

const settingDefaults: GlobalSettings = {
  token_exchange_rate: 401,
  brutto_coefficient: 2.2,
  usd_to_rub_rate: 100,
  token_charging_enabled: false,
  custom_token_purchase_enabled: true,
};

let billingSetup: Promise<void> | null = null;
export function ensureBillingStore() {
  if (billingSetup) return billingSetup;
  billingSetup = (async () => {
    await database.batch([
      database.prepare("CREATE TABLE IF NOT EXISTS auth_identities (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, provider_email TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(provider, provider_user_id), UNIQUE(user_id, provider), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, code_verifier TEXT NOT NULL, tenant_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by_admin_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (updated_by_admin_id) REFERENCES users(id) ON DELETE SET NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS global_setting_history (id TEXT PRIMARY KEY, setting_key TEXT NOT NULL, old_value_json TEXT, new_value_json TEXT NOT NULL, admin_user_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT)"),
      database.prepare("CREATE TABLE IF NOT EXISTS token_accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS token_transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_before INTEGER NOT NULL, balance_after INTEGER NOT NULL CHECK(balance_after >= 0), reference_type TEXT, reference_id TEXT, source_user_id TEXT, target_user_id TEXT, initiated_by_admin_id TEXT, description TEXT, metadata_json TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS token_transfers (id TEXT PRIMARY KEY, source_user_id TEXT NOT NULL, target_user_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), initiated_by_admin_id TEXT NOT NULL, reason TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'RUB', billing_period TEXT, included_tokens INTEGER NOT NULL DEFAULT 0, limits_json TEXT, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, current_period_start TEXT, current_period_end TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, provider TEXT, external_customer_id TEXT, external_subscription_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS token_packages (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, token_amount INTEGER NOT NULL, price INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'RUB', active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, external_payment_id TEXT, amount INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, purpose TEXT NOT NULL, token_package_id TEXT, subscription_id TEXT, token_amount INTEGER NOT NULL DEFAULT 0, exchange_rate_snapshot INTEGER NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, paid_at TEXT, failed_at TEXT, refunded_at TEXT, metadata_json TEXT)"),
      database.prepare("CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, provider TEXT NOT NULL, external_event_id TEXT NOT NULL, event_type TEXT NOT NULL, payload_hash TEXT NOT NULL, processed_at TEXT, created_at TEXT NOT NULL, UNIQUE(provider, external_event_id))"),
      database.prepare("CREATE TABLE IF NOT EXISTS ai_operation_prices (operation TEXT PRIMARY KEY, estimated_netto_usd REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, metadata_json TEXT, ip_hash TEXT, created_at TEXT NOT NULL)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created ON token_transactions(user_id, created_at DESC)"),
    ]);
    const generationColumns = await database.prepare("PRAGMA table_info(generations)").all<{ name: string }>();
    const names = new Set(generationColumns.results.map((column) => column.name));
    if (!names.has("token_transaction_id")) await database.prepare("ALTER TABLE generations ADD COLUMN token_transaction_id TEXT").run();
    if (!names.has("token_cost")) await database.prepare("ALTER TABLE generations ADD COLUMN token_cost INTEGER").run();
    if (!names.has("brutto_coefficient_snapshot")) await database.prepare("ALTER TABLE generations ADD COLUMN brutto_coefficient_snapshot REAL").run();
    const now = new Date().toISOString();
    await database.batch([
      ...Object.entries(settingDefaults).map(([key, value]) => database.prepare("INSERT OR IGNORE INTO global_settings (key, value_json, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(key, JSON.stringify(value), now, now)),
      database.prepare("INSERT OR IGNORE INTO plans (id, code, name, description, price, currency, billing_period, included_tokens, limits_json, active, sort_order, created_at, updated_at) VALUES ('plan_free', 'free', 'Free', 'Базовый доступ Room Design', 0, 'RUB', 'month', 0, '{}', 1, 0, ?, ?)").bind(now, now),
      database.prepare("INSERT OR IGNORE INTO token_packages (id, code, name, token_amount, price, currency, active, sort_order, created_at, updated_at) VALUES ('package_100', 'tokens-100-rub', 'Стартовый пакет', 40100, 10000, 'RUB', 1, 10, ?, ?)").bind(now, now),
      database.prepare("INSERT OR IGNORE INTO token_packages (id, code, name, token_amount, price, currency, active, sort_order, created_at, updated_at) VALUES ('package_1000', 'tokens-1000-rub', 'Рабочий пакет', 401000, 100000, 'RUB', 1, 20, ?, ?)").bind(now, now),
      database.prepare("INSERT OR IGNORE INTO ai_operation_prices (operation, estimated_netto_usd, created_at, updated_at) VALUES ('generate', 0.04, ?, ?)").bind(now, now),
      database.prepare("INSERT OR IGNORE INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at) SELECT 'identity_password_' || id, id, 'password', id, email, created_at, COALESCE(last_login_at, created_at) FROM users WHERE password_algorithm = 'pbkdf2-sha256'"),
    ]);
  })();
  return billingSetup;
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  await ensureBillingStore();
  const rows = await database.prepare("SELECT key, value_json FROM global_settings").all<{ key: keyof GlobalSettings; value_json: string }>();
  const settings = { ...settingDefaults };
  for (const row of rows.results) if (row.key in settings) Object.assign(settings, { [row.key]: JSON.parse(row.value_json) });
  return settings;
}

export async function updateGlobalSettings(adminUserId: string, patch: Partial<GlobalSettings>) {
  await ensureBillingStore();
  const allowed = new Set(Object.keys(settingDefaults));
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    const expected = settingDefaults[key as keyof GlobalSettings];
    if (typeof value !== typeof expected) throw new Error(`Некорректный тип ${key}.`);
    if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) throw new Error(`Некорректное значение ${key}.`);
    if (key === "token_exchange_rate" && !Number.isSafeInteger(value)) throw new Error("Курс токенов должен быть целым числом.");
    const current = await database.prepare("SELECT value_json FROM global_settings WHERE key = ?").bind(key).first<{ value_json: string }>();
    const next = JSON.stringify(value);
    await database.batch([
      database.prepare("INSERT INTO global_setting_history (id, setting_key, old_value_json, new_value_json, admin_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), key, current?.value_json ?? null, next, adminUserId, now),
      database.prepare("INSERT INTO global_settings (key, value_json, updated_by_admin_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by_admin_id = excluded.updated_by_admin_id, updated_at = excluded.updated_at").bind(key, next, adminUserId, now, now),
      database.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, 'settings.update', 'global_setting', ?, ?, ?)").bind(crypto.randomUUID(), adminUserId, key, JSON.stringify({ old: current?.value_json ?? null, next }), now),
    ]);
  }
  return getGlobalSettings();
}

type Mutation = { userId: string; type: TokenTransactionType; amount: number; referenceType?: string; referenceId?: string; sourceUserId?: string; targetUserId?: string; initiatedByAdminId?: string; description?: string; metadata?: Record<string, unknown>; idempotencyKey: string };

function accountInTransaction(sqlite: import("node:sqlite").DatabaseSync, userId: string) {
  const now = new Date().toISOString();
  sqlite.prepare("INSERT OR IGNORE INTO token_accounts (id, user_id, balance, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").run(crypto.randomUUID(), userId, now, now);
  return sqlite.prepare("SELECT id, user_id, balance FROM token_accounts WHERE user_id = ?").get(userId) as { id: string; user_id: string; balance: number };
}

function mutateBalance(mutation: Mutation) {
  const amount = Math.trunc(mutation.amount);
  if (!Number.isSafeInteger(amount) || amount === 0) throw new Error("Сумма токенов должна быть целым ненулевым числом.");
  return database.transaction((sqlite) => {
    const duplicate = sqlite.prepare("SELECT * FROM token_transactions WHERE idempotency_key = ?").get(mutation.idempotencyKey);
    if (duplicate) return duplicate;
    const account = accountInTransaction(sqlite, mutation.userId);
    const after = account.balance + amount;
    if (after < 0) throw new Error("Недостаточно токенов.");
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE token_accounts SET balance = ?, updated_at = ? WHERE user_id = ?").run(after, now, mutation.userId);
    const id = crypto.randomUUID();
    sqlite.prepare("INSERT INTO token_transactions (id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, source_user_id, target_user_id, initiated_by_admin_id, description, metadata_json, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, mutation.userId, mutation.type, amount, account.balance, after, mutation.referenceType ?? null, mutation.referenceId ?? null, mutation.sourceUserId ?? null, mutation.targetUserId ?? null, mutation.initiatedByAdminId ?? null, mutation.description ?? null, JSON.stringify(mutation.metadata ?? {}), mutation.idempotencyKey, now);
    return sqlite.prepare("SELECT * FROM token_transactions WHERE id = ?").get(id);
  });
}

export async function getTokenAccount(userId: string) {
  await ensureBillingStore();
  return database.transaction((sqlite) => accountInTransaction(sqlite, userId));
}

export async function getTokenHistory(userId: string, limit = 100) {
  await ensureBillingStore();
  return (await database.prepare("SELECT * FROM token_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").bind(userId, Math.min(Math.max(limit, 1), 500)).all()).results;
}

export async function creditTokens(input: Omit<Mutation, "amount"> & { amount: number }) {
  await ensureBillingStore();
  if (input.amount <= 0) throw new Error("Начисление должно быть положительным.");
  return mutateBalance(input);
}

export async function debitTokens(input: Omit<Mutation, "amount"> & { amount: number }) {
  await ensureBillingStore();
  if (input.amount <= 0) throw new Error("Списание должно быть положительным.");
  return mutateBalance({ ...input, amount: -input.amount });
}

export async function transferTokens(input: { sourceUserId: string; targetUserId: string; amount: number; adminUserId: string; reason?: string; idempotencyKey: string }) {
  await ensureBillingStore();
  const amount = Math.trunc(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Укажите положительное целое количество токенов.");
  if (input.sourceUserId === input.targetUserId) throw new Error("Получатель должен отличаться от отправителя.");
  return database.transaction((sqlite) => {
    const existing = sqlite.prepare("SELECT * FROM token_transfers WHERE idempotency_key = ?").get(input.idempotencyKey);
    if (existing) return existing;
    const source = accountInTransaction(sqlite, input.sourceUserId);
    const target = accountInTransaction(sqlite, input.targetUserId);
    if (source.balance < amount) throw new Error("Недостаточно токенов у отправителя.");
    const now = new Date().toISOString();
    const transferId = crypto.randomUUID();
    sqlite.prepare("UPDATE token_accounts SET balance = ?, updated_at = ? WHERE user_id = ?").run(source.balance - amount, now, input.sourceUserId);
    sqlite.prepare("UPDATE token_accounts SET balance = ?, updated_at = ? WHERE user_id = ?").run(target.balance + amount, now, input.targetUserId);
    sqlite.prepare("INSERT INTO token_transfers (id, source_user_id, target_user_id, amount, initiated_by_admin_id, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(transferId, input.sourceUserId, input.targetUserId, amount, input.adminUserId, input.reason ?? null, input.idempotencyKey, now);
    const insertTransaction = sqlite.prepare("INSERT INTO token_transactions (id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, source_user_id, target_user_id, initiated_by_admin_id, description, metadata_json, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?, ?, '{}', ?, ?)");
    insertTransaction.run(crypto.randomUUID(), input.sourceUserId, "transfer_out", -amount, source.balance, source.balance - amount, transferId, input.sourceUserId, input.targetUserId, input.adminUserId, input.reason ?? null, `${input.idempotencyKey}:out`, now);
    insertTransaction.run(crypto.randomUUID(), input.targetUserId, "transfer_in", amount, target.balance, target.balance + amount, transferId, input.sourceUserId, input.targetUserId, input.adminUserId, input.reason ?? null, `${input.idempotencyKey}:in`, now);
    sqlite.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, 'tokens.transfer', 'token_transfer', ?, ?, ?)").run(crypto.randomUUID(), input.adminUserId, transferId, JSON.stringify({ sourceUserId: input.sourceUserId, targetUserId: input.targetUserId, amount }), now);
    return sqlite.prepare("SELECT * FROM token_transfers WHERE id = ?").get(transferId);
  });
}

export async function quoteTokenPurchase(rubles: number) {
  const settings = await getGlobalSettings();
  const amountKopecks = Math.round(rubles * 100);
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) throw new Error("Укажите корректную сумму.");
  return { amountKopecks, currency: "RUB", tokenAmount: Math.floor(rubles * settings.token_exchange_rate), exchangeRate: settings.token_exchange_rate };
}

export async function quoteAiOperation(operation: string) {
  await ensureBillingStore();
  const settings = await getGlobalSettings();
  const price = await database.prepare("SELECT estimated_netto_usd FROM ai_operation_prices WHERE operation = ? AND active = 1").bind(operation).first<{ estimated_netto_usd: number }>()
    || await database.prepare("SELECT estimated_netto_usd FROM ai_operation_prices WHERE operation = 'generate' AND active = 1").first<{ estimated_netto_usd: number }>();
  const nettoUsd = Number(price?.estimated_netto_usd ?? 0);
  const rubles = nettoUsd * settings.brutto_coefficient * settings.usd_to_rub_rate;
  return { operation, nettoUsd, bruttoCoefficient: settings.brutto_coefficient, tokenCost: Math.max(0, Math.ceil(rubles * settings.token_exchange_rate)), chargingEnabled: settings.token_charging_enabled };
}

export async function reserveAiTokens(userId: string, operation: string, referenceId: string, idempotencyKey: string) {
  const quote = await quoteAiOperation(operation);
  if (!quote.chargingEnabled || quote.tokenCost === 0) return { quote, transaction: null };
  const transaction = await debitTokens({ userId, type: "generation", amount: quote.tokenCost, referenceType: "ai_operation", referenceId, description: `Резерв токенов: ${operation}`, metadata: quote, idempotencyKey });
  return { quote, transaction };
}

export async function refundAiTokens(userId: string, operationId: string, amount: number, reason: string) {
  if (amount <= 0) return null;
  return creditTokens({ userId, type: "refund", amount, referenceType: "ai_operation", referenceId: operationId, description: reason, idempotencyKey: `ai-refund:${operationId}` });
}

export const payloadHash = (payload: string) => createHash("sha256").update(payload).digest("hex");
