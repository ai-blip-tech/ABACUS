import { database } from "./server-runtime.ts";

export const TECHNICAL_LIGHTING_STUCK_AFTER_MS = 4 * 60 * 1000;

type OperationOwner = { userId: string; tenantId: string };

let setupPromise: Promise<void> | null = null;

export function ensureTechnicalLightingOperationStore() {
  if (setupPromise) return setupPromise;
  setupPromise = database.prepare(`
    CREATE TABLE IF NOT EXISTS technical_lighting_operations (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      request_fingerprint TEXT,
      operation_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `).run().then(async () => {
    await database.batch([
      database.prepare("CREATE INDEX IF NOT EXISTS idx_technical_lighting_operations_owner ON technical_lighting_operations(tenant_id, user_id, created_at DESC)"),
    ]);
  });
  return setupPromise;
}

export async function registerTechnicalLightingOperation(input: OperationOwner & {
  requestId: string;
  requestFingerprint: string | null;
  operationType: string;
}) {
  await ensureTechnicalLightingOperationStore();
  const existing = await database.prepare(`
    SELECT user_id, tenant_id, request_fingerprint, operation_type
    FROM technical_lighting_operations
    WHERE request_id = ?
  `).bind(input.requestId).first<{
    user_id: string;
    tenant_id: string;
    request_fingerprint: string | null;
    operation_type: string;
  }>();
  if (existing) {
    const sameOwner = existing.user_id === input.userId && existing.tenant_id === input.tenantId;
    const sameFingerprint = !existing.request_fingerprint || !input.requestFingerprint || existing.request_fingerprint === input.requestFingerprint;
    const sameOperation = existing.operation_type === input.operationType;
    return sameOwner && sameFingerprint && sameOperation ? "existing" as const : "conflict" as const;
  }
  const now = new Date().toISOString();
  await database.prepare(`
    INSERT INTO technical_lighting_operations (
      request_id, user_id, tenant_id, request_fingerprint, operation_type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(input.requestId, input.userId, input.tenantId, input.requestFingerprint, input.operationType, now, now).run();
  return "created" as const;
}

export async function findTechnicalLightingOperation(owner: OperationOwner, requestId: string) {
  await ensureTechnicalLightingOperationStore();
  return database.prepare(`
    SELECT request_id, request_fingerprint, operation_type, created_at, updated_at
    FROM technical_lighting_operations
    WHERE request_id = ? AND user_id = ? AND tenant_id = ?
  `).bind(requestId, owner.userId, owner.tenantId).first<{
    request_id: string;
    request_fingerprint: string | null;
    operation_type: string;
    created_at: string;
    updated_at: string;
  }>();
}
