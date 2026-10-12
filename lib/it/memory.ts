import type { AppUser } from "../auth.ts";
import { database } from "../server-runtime.ts";
import type { ItCatalogProduct, ItConversationMessage } from "./types.ts";

const RETENTION_DAYS = 30;
const MAX_STORED_MESSAGES = 80;
const MAX_CONTEXT_MESSAGES = 16;
const VISITOR_COOKIE = "ono_visitor";

type ConversationSession = {
  id: string;
  tenant_id: string;
  site_id: string;
  user_id: string | null;
  visitor_id: string;
  summary: string | null;
  state_json: string | null;
};

export type StoredOnoMessage = ItConversationMessage & {
  id: string;
  createdAt: string;
};

let setupPromise: Promise<void> | null = null;
let cleanupPromise: Promise<void> | null = null;
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export async function ensureOnoMemoryStore() {
  if (!setupPromise) setupPromise = database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS ono_chat_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      user_id TEXT,
      visitor_id TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      summary TEXT,
      state_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS ono_chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      request_id TEXT,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      image_present INTEGER NOT NULL DEFAULT 0,
      products_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES ono_chat_sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, request_id, role)
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_sessions_identity ON ono_chat_sessions(tenant_id, site_id, user_id, visitor_id, updated_at DESC)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_sessions_expiry ON ono_chat_sessions(expires_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ono_messages_session_created ON ono_chat_messages(session_id, created_at)"),
  ]).then(() => undefined);
  await setupPromise;
  if (Date.now() - lastCleanupAt >= CLEANUP_INTERVAL_MS && !cleanupPromise) {
    lastCleanupAt = Date.now();
    cleanupPromise = database.prepare("DELETE FROM ono_chat_sessions WHERE expires_at < ?")
      .bind(new Date().toISOString()).run()
      .then(() => undefined)
      .finally(() => { cleanupPromise = null; });
  }
  if (cleanupPromise) await cleanupPromise;
}

const cookieValue = (request: Request, name: string) => request.headers.get("cookie")
  ?.split(";")
  .map((part) => part.trim())
  .find((part) => part.startsWith(`${name}=`))
  ?.slice(name.length + 1) || "";

const expiresAt = () => new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();
const safeVisitor = (value: string) => /^[a-zA-Z0-9_-]{16,100}$/.test(value) ? value : crypto.randomUUID();

export const onoVisitorCookie = (visitorId: string) => `${VISITOR_COOKIE}=${visitorId}; Path=/; HttpOnly${process.env.NODE_ENV === "production" ? "; Secure" : ""}; SameSite=Lax; Max-Age=${RETENTION_DAYS * 86400}`;

export async function resolveOnoConversation(input: {
  request: Request;
  tenantId: string;
  siteId: string;
  user: AppUser | null;
  requestedSessionId?: string | null;
}) {
  await ensureOnoMemoryStore();
  const visitorFromCookie = cookieValue(input.request, VISITOR_COOKIE);
  const visitorId = safeVisitor(visitorFromCookie);
  const identityWhere = input.user ? "user_id = ?" : "user_id IS NULL AND visitor_id = ?";
  const identityValue = input.user?.id || visitorId;
  let session: ConversationSession | null = null;
  if (input.requestedSessionId && /^[0-9a-f-]{36}$/i.test(input.requestedSessionId)) {
    session = await database.prepare(`SELECT * FROM ono_chat_sessions WHERE id = ? AND tenant_id = ? AND site_id = ? AND ${identityWhere} AND expires_at > ?`)
      .bind(input.requestedSessionId, input.tenantId, input.siteId, identityValue, new Date().toISOString()).first<ConversationSession>();
  }
  if (!session) {
    session = await database.prepare(`SELECT * FROM ono_chat_sessions WHERE tenant_id = ? AND site_id = ? AND ${identityWhere} AND expires_at > ? ORDER BY updated_at DESC LIMIT 1`)
      .bind(input.tenantId, input.siteId, identityValue, new Date().toISOString()).first<ConversationSession>();
  }
  if (!session) {
    const now = new Date().toISOString();
    session = { id: crypto.randomUUID(), tenant_id: input.tenantId, site_id: input.siteId, user_id: input.user?.id || null, visitor_id: visitorId, summary: null, state_json: null };
    await database.prepare("INSERT INTO ono_chat_sessions (id, tenant_id, site_id, user_id, visitor_id, consent_version, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, 'essential-memory-v1', ?, ?, ?)")
      .bind(session.id, input.tenantId, input.siteId, session.user_id, visitorId, now, now, expiresAt()).run();
  }
  return { session, visitorId, setVisitorCookie: visitorFromCookie !== visitorId };
}

const parseProducts = (value: string | null) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed as ItCatalogProduct[] : [];
  } catch {
    return [];
  }
};

export async function loadOnoMessages(sessionId: string, limit = MAX_STORED_MESSAGES): Promise<StoredOnoMessage[]> {
  await ensureOnoMemoryStore();
  const rows = await database.prepare("SELECT id, role, text, image_present, products_json, created_at FROM ono_chat_messages WHERE session_id = ? ORDER BY created_at DESC, CASE role WHEN 'assistant' THEN 1 ELSE 0 END DESC, id DESC LIMIT ?")
    .bind(sessionId, Math.min(Math.max(limit, 1), MAX_STORED_MESSAGES)).all<Record<string, unknown>>();
  return rows.results.reverse().map((row) => ({
    id: String(row.id),
    role: row.role === "assistant" ? "assistant" : "user",
    text: String(row.text || ""),
    ...(parseProducts(row.products_json ? String(row.products_json) : null).length ? { products: parseProducts(String(row.products_json)) } : {}),
    createdAt: String(row.created_at),
  }));
}

export async function loadOnoContext(session: ConversationSession) {
  const messages = await loadOnoMessages(session.id, MAX_STORED_MESSAGES);
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES);
  const older = messages.slice(0, -MAX_CONTEXT_MESSAGES);
  const summary = older.length
    ? older.slice(-12).map((message) => `${message.role === "user" ? "Пользователь" : "Оно"}: ${message.text.slice(0, 240)}`).join("\n").slice(0, 2400)
    : session.summary || "";
  let state: Record<string, unknown> = {};
  try { state = session.state_json ? JSON.parse(session.state_json) as Record<string, unknown> : {}; } catch { state = {}; }
  return { messages: recent, summary, state };
}

export async function storedOnoReply(sessionId: string, requestId: string) {
  const row = await database.prepare("SELECT text, products_json FROM ono_chat_messages WHERE session_id = ? AND request_id = ? AND role = 'assistant'")
    .bind(sessionId, requestId).first<{ text: string; products_json: string | null }>();
  return row ? { text: row.text, products: parseProducts(row.products_json) } : null;
}

export async function saveOnoTurn(input: {
  session: ConversationSession;
  requestId: string;
  userText: string;
  imagePresent: boolean;
  assistantText: string;
  products?: ItCatalogProduct[];
  state?: Record<string, unknown>;
}) {
  await ensureOnoMemoryStore();
  const now = new Date().toISOString();
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO ono_chat_messages (id, session_id, request_id, role, text, image_present, created_at) VALUES (?, ?, ?, 'user', ?, ?, ?)")
      .bind(crypto.randomUUID(), input.session.id, input.requestId, input.userText.slice(0, 8000), input.imagePresent ? 1 : 0, now),
    database.prepare("INSERT OR IGNORE INTO ono_chat_messages (id, session_id, request_id, role, text, products_json, created_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?)")
      .bind(crypto.randomUUID(), input.session.id, input.requestId, input.assistantText.slice(0, 12000), input.products?.length ? JSON.stringify(input.products.slice(0, 10)) : null, now),
    database.prepare("UPDATE ono_chat_sessions SET state_json = ?, updated_at = ?, expires_at = ? WHERE id = ?")
      .bind(JSON.stringify(input.state || {}), now, expiresAt(), input.session.id),
  ]);
}

export async function deleteOnoConversation(sessionId: string, tenantId: string, user: AppUser | null, visitorId: string) {
  await ensureOnoMemoryStore();
  const identityWhere = user ? "user_id = ?" : "user_id IS NULL AND visitor_id = ?";
  await database.prepare(`DELETE FROM ono_chat_sessions WHERE id = ? AND tenant_id = ? AND ${identityWhere}`)
    .bind(sessionId, tenantId, user?.id || visitorId).run();
}
