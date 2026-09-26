CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id),
  UNIQUE(user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at)
SELECT 'identity_password_' || id, id, 'password', id, email, created_at, COALESCE(last_login_at, created_at) FROM users
WHERE password_algorithm = 'pbkdf2-sha256';

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS global_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by_admin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (updated_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS global_setting_history (
  id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO global_settings (key, value_json, created_at, updated_at) VALUES
  ('token_exchange_rate', '401', datetime('now'), datetime('now')),
  ('brutto_coefficient', '2.2', datetime('now'), datetime('now')),
  ('usd_to_rub_rate', '100', datetime('now'), datetime('now')),
  ('token_charging_enabled', 'false', datetime('now'), datetime('now')),
  ('custom_token_purchase_enabled', 'true', datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS token_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS token_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
  reference_type TEXT,
  reference_id TEXT,
  source_user_id TEXT,
  target_user_id TEXT,
  initiated_by_admin_id TEXT,
  description TEXT,
  metadata_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (initiated_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created ON token_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS token_transfers (
  id TEXT PRIMARY KEY,
  source_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  initiated_by_admin_id TEXT NOT NULL,
  reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (initiated_by_admin_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
  price INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'RUB', billing_period TEXT,
  included_tokens INTEGER NOT NULL DEFAULT 0, limits_json TEXT, active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL, status TEXT NOT NULL,
  started_at TEXT NOT NULL, current_period_start TEXT, current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0, provider TEXT,
  external_customer_id TEXT, external_subscription_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS token_packages (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  token_amount INTEGER NOT NULL, price INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'RUB',
  active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, external_payment_id TEXT,
  amount INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, purpose TEXT NOT NULL,
  token_package_id TEXT, subscription_id TEXT, token_amount INTEGER NOT NULL DEFAULT 0,
  exchange_rate_snapshot INTEGER NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, paid_at TEXT, failed_at TEXT, refunded_at TEXT, metadata_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (token_package_id) REFERENCES token_packages(id) ON DELETE SET NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL, event_type TEXT NOT NULL, payload_hash TEXT NOT NULL,
  processed_at TEXT, created_at TEXT NOT NULL,
  UNIQUE(provider, external_event_id),
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_operation_prices (
  operation TEXT PRIMARY KEY, estimated_netto_usd REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_operation_prices (operation, estimated_netto_usd, created_at, updated_at) VALUES
  ('generate', 0.04, datetime('now'), datetime('now')),
  ('segment', 0.01, datetime('now'), datetime('now')),
  ('proposal', 0.02, datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, metadata_json TEXT, ip_hash TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE generations ADD COLUMN token_transaction_id TEXT;
ALTER TABLE generations ADD COLUMN token_cost INTEGER;
ALTER TABLE generations ADD COLUMN brutto_coefficient_snapshot REAL;

INSERT OR IGNORE INTO plans (id, code, name, description, price, currency, billing_period, included_tokens, limits_json, active, sort_order, created_at, updated_at)
VALUES ('plan_free', 'free', 'Free', 'Базовый доступ Room Design', 0, 'RUB', 'month', 0, '{}', 1, 0, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO token_packages (id, code, name, token_amount, price, currency, active, sort_order, created_at, updated_at) VALUES
  ('package_100', 'tokens-100-rub', 'Стартовый пакет', 40100, 10000, 'RUB', 1, 10, datetime('now'), datetime('now')),
  ('package_1000', 'tokens-1000-rub', 'Рабочий пакет', 401000, 100000, 'RUB', 1, 20, datetime('now'), datetime('now'));
