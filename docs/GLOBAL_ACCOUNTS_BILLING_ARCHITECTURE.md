# Global accounts, billing and regional separation

## Boundaries

The global Room Design account (`users`) is independent from organization access (`tenant_memberships`). A user may sign in and use account/billing APIs without any membership. Tenant-scoped project, catalog and generation APIs require a membership even for a global administrator; a global administrator accesses global administration independently and is never automatically added to `tenant_norrmobler`.

Authentication methods are child records in `auth_identities`. A verified Google identity is first resolved by `(provider, provider_user_id)`, then safely linked to the single global user with the normalized verified email. Google login creates no tenant membership. Password and Google can coexist for one user.

## Entity relationships

```text
users 1 ── * auth_identities
users 1 ── * sessions
users * ── * tenants          via tenant_memberships (member/admin/owner)
users 1 ── 1 token_accounts
users 1 ── * token_transactions
users 1 ── * payments ── * payment_events
users 1 ── * subscriptions * ── 1 plans
payments * ── 0..1 token_packages
generations * ── 0..1 token_transactions
global_settings 1 ── * global_setting_history
token_transfers 1 ── 2 token_transactions (transfer_out + transfer_in)
```

All token balance changes pass through `lib/billing.ts`. Ledger writes and balance updates are atomic SQLite transactions, cannot produce a negative balance, and have unique idempotency keys. A transfer debits an existing source balance and credits the target in one transaction; it does not mint tokens. Purchase, subscription credit, refund and explicit correction are auditable origin types.

The purchase quote reads `token_exchange_rate` from the database (default 401 tokens/RUB). Each payment stores `exchange_rate_snapshot`, so later setting changes do not rewrite history. AI price is computed server-side from the existing netto estimate, `usd_to_rub_rate`, and the mutable `brutto_coefficient`. The resulting token price and coefficient snapshot are saved with the generation. Charging can be rolled out using `token_charging_enabled`; when enabled, tokens are reserved before the provider call and refunded on technical failure. Ledger idempotency prevents double debit and double refund.

`PaymentProvider` isolates provider-specific create/status/webhook/refund/customer/subscription operations. The included mock provider is for development only. Production requires an adapter with signature verification, provider API credentials, reconciliation, receipt/fiscalization rules and refund handling. The webhook event ID and payment-credit ledger key are independently idempotent, including recovery after a process interruption.

## Petersburg / Amsterdam target

Petersburg should become the system of record for identity and identifiable payment data: profile fields, email/phone, password credentials, Google identity, verification/reset tokens, sessions/refresh tokens, tenant membership administration, auth audit data, payer/receipt fields and provider customer identifiers where identifiable. Amsterdam should consume opaque `user_id`/`tenant_id`, technical roles or scoped authorization claims, payment status/reference, token and ledger IDs, project IDs and the minimum operational data required for generation.

The current service keeps stable opaque IDs and isolates auth/billing behind server modules and HTTP account/admin boundaries, allowing these modules to become Petersburg Auth/Billing API clients later without rewriting the browser interface. A production extraction still needs signed short-lived service tokens, key rotation, regional database migration, retry/outbox semantics, reconciliation and a documented deletion/export process.

## Data classification

- **PII:** name, surname, email, phone, company/position, payer/receipt contact data, IP address and possibly provider customer identifiers.
- **Auth secrets:** password hash/salt/algorithm/iterations, session tokens (only hashes persisted), OAuth client secret, OAuth state/PKCE verifier, reset/verification/refresh tokens. These belong in Petersburg or a secrets manager; never logs or client payloads.
- **Payment-sensitive metadata:** provider event payloads, payer and receipt attributes, external customer/payment references. Store the minimum; encrypt/restrict access and define retention. Room Design must never store PAN, CVV/CVC, PIN or raw card credentials.
- **Technical identifiers:** opaque user/tenant/project/generation/transaction/payment IDs, idempotency keys and technical payment status.
- **Business data:** plans, package prices, subscriptions, token balances/ledger, exchange-rate and brutto-setting history.
- **AI/project data:** project state, interior and user-uploaded photos, generated images, prompts and generation history.

Before production launch, counsel and security must confirm regional placement, lawful basis, consent/notices, retention and deletion for interior/user/generated images, prompts, IP and audit logs, and identifiable payment metadata. This document is an engineering classification, not a legal conclusion.
