import { database, objectStorage } from "./server-runtime.ts";

const DEFAULT_TENANT_ID = "tenant_norrmobler";
const DEFAULT_TENANT_SLUG = "norrmobler";
const PRODUCTION_HOST = "norr-club.testaimoblernorr.chatgpt.site";

export type TenantContext = { id: string; slug: string; name: string };
export type GlobalRole = "user" | "admin";
export type TenantRole = "member" | "admin" | "owner";
export type AppUser = {
  id: string; email: string; role: GlobalRole;
  tenantId: string; tenantSlug: string; tenantRole: TenantRole | null;
  firstName: string; lastName: string; phone: string; companyRole: string;
};
export type RegistrationProfile = { firstName: string; lastName?: string; phone?: string; companyRole?: string };

type AuthIdentityRow = Omit<AppUser, "tenantId" | "tenantSlug" | "tenantRole"> & {
  tenantRole: string | null;
  password_hash?: string;
  password_salt?: string;
  password_algorithm?: string;
  password_iterations?: number;
};

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const fromB64 = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
const randomValue = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async (value: string) => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 600_000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function passwordHash(password: string, salt = randomValue(), iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromB64(salt), iterations, hash: "SHA-256" }, key, 256);
  return { salt, hash: b64(new Uint8Array(bits)), algorithm: PASSWORD_ALGORITHM, iterations };
}

const equal = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
};

async function passwordMatches(password: string, credential: { hash?: string; salt?: string; algorithm?: string; iterations?: number }) {
  if (credential.algorithm !== PASSWORD_ALGORITHM || !credential.hash || !credential.salt) return false;
  const iterations = credential.iterations;
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < 100_000) return false;
  const secured = await passwordHash(password, credential.salt, iterations);
  return equal(secured.hash, credential.hash);
}

const d1 = () => {
  return database;
};

async function addColumnIfMissing(table: string, name: string, type: string) {
  const columns = await d1().prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (!columns.results.some((column: { name: string }) => column.name === name)) await d1().prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
}

async function migrateUserSchema() {
  const columns = await d1().prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("global_role") && names.has("role")) {
    await d1().prepare("ALTER TABLE users RENAME COLUMN role TO global_role").run();
    names.add("global_role");
  }
  if (!names.has("global_role")) await d1().prepare("ALTER TABLE users ADD COLUMN global_role TEXT NOT NULL DEFAULT 'user'").run();
  if (!names.has("password_algorithm")) await d1().prepare("ALTER TABLE users ADD COLUMN password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256'").run();
  if (!names.has("password_iterations")) await d1().prepare("ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000").run();
}

let setup: Promise<void> | null = null;
export function ensureStore() {
  if (setup) return setup;
  const database = d1();
  setup = (async () => {
    await database.batch([
      database.prepare("CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', settings_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
      database.prepare("CREATE TABLE IF NOT EXISTS tenant_domains (hostname TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256', password_iterations INTEGER NOT NULL DEFAULT 600000, global_role TEXT NOT NULL DEFAULT 'user', first_name TEXT, last_name TEXT, phone TEXT, company_role TEXT, created_at TEXT NOT NULL, last_login_at TEXT)"),
      database.prepare("CREATE TABLE IF NOT EXISTS tenant_memberships (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id), FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS ai_jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_id TEXT, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_id TEXT, operation TEXT NOT NULL, prompt TEXT, output_key TEXT NOT NULL, content_type TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_id TEXT, name TEXT NOT NULL, project_type TEXT NOT NULL DEFAULT 'Квартира', description TEXT, state_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_generations_user_created_at ON generations(user_id, created_at DESC)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_projects_user_updated_at ON projects(user_id, updated_at DESC)"),
    ]);
    await migrateUserSchema();
    await addColumnIfMissing("projects", "state_json", "TEXT");
    await addColumnIfMissing("projects", "tenant_id", "TEXT");
    await addColumnIfMissing("sessions", "tenant_id", "TEXT");
    await addColumnIfMissing("generations", "tenant_id", "TEXT");
    for (const [name, type] of [["first_name", "TEXT"], ["last_name", "TEXT"], ["phone", "TEXT"], ["company_role", "TEXT"]] as const) await addColumnIfMissing("users", name, type);

    const now = new Date().toISOString();
    await database.prepare("INSERT OR IGNORE INTO tenants (id, slug, name, status, settings_json, created_at, updated_at) VALUES (?, ?, ?, 'active', '{}', ?, ?)").bind(DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG, "NORR Møbler", now, now).run();
    await database.prepare("INSERT OR IGNORE INTO tenant_domains (hostname, tenant_id, created_at) VALUES (?, ?, ?)").bind(PRODUCTION_HOST, DEFAULT_TENANT_ID, now).run();

    await database.batch([
      database.prepare("DELETE FROM tenant_memberships WHERE tenant_id = ? AND role = 'tenant_admin' AND user_id IN (SELECT id FROM users WHERE global_role = 'admin')").bind(DEFAULT_TENANT_ID),
      database.prepare("UPDATE tenant_memberships SET role = 'admin' WHERE role = 'tenant_admin'"),
      database.prepare("UPDATE sessions SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''").bind(DEFAULT_TENANT_ID),
      database.prepare("UPDATE generations SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''").bind(DEFAULT_TENANT_ID),
      database.prepare("UPDATE projects SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''").bind(DEFAULT_TENANT_ID),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_tenant_token ON sessions(tenant_id, token_hash)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_generations_tenant_user_created ON generations(tenant_id, user_id, created_at DESC)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_projects_tenant_user_updated ON projects(tenant_id, user_id, updated_at DESC)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_ai_jobs_tenant_user ON ai_jobs(tenant_id, user_id, created_at DESC)"),
    ]);
  })();
  return setup;
}

export async function tenantForRequest(request: Request): Promise<TenantContext> {
  await ensureStore();
  let hostname = "";
  try { hostname = new URL(request.url).hostname.toLowerCase(); } catch { /* default below */ }
  const tenant = hostname ? await d1().prepare("SELECT tenants.id, tenants.slug, tenants.name FROM tenant_domains JOIN tenants ON tenants.id = tenant_domains.tenant_id WHERE tenant_domains.hostname = ? AND tenants.status = 'active'").bind(hostname).first<TenantContext>() : null;
  if (tenant) return tenant;
  const fallback = await d1().prepare("SELECT id, slug, name FROM tenants WHERE slug = ? AND status = 'active'").bind(DEFAULT_TENANT_SLUG).first<TenantContext>();
  if (!fallback) throw new Error("Организация сайта не настроена.");
  return fallback;
}

const secureCookie = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
const secureCookieAttribute = secureCookie ? "; Secure" : "";
export const sessionCookie = (token: string) => `room_session=${token}; Path=/; HttpOnly${secureCookieAttribute}; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
export const clearSessionCookie = `room_session=; Path=/; HttpOnly${secureCookieAttribute}; SameSite=Lax; Max-Age=0`;
function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("room_session="))?.slice("room_session=".length) || "";
}

const userRecord = (row: AuthIdentityRow | null, tenant: TenantContext) => row ? {
  id: row.id,
  email: row.email,
  role: row.role === "admin" ? "admin" as const : "user" as const,
  tenantId: tenant.id,
  tenantSlug: tenant.slug,
  tenantRole: row.tenantRole === "owner" ? "owner" as const : row.tenantRole === "admin" ? "admin" as const : row.tenantRole === "member" ? "member" as const : null,
  firstName: row.firstName || "", lastName: row.lastName || "", phone: row.phone || "", companyRole: row.companyRole || "",
} : null;

export async function currentUser(request: Request): Promise<AppUser | null> {
  const tenant = await tenantForRequest(request);
  const token = cookieValue(request);
  if (!token) return null;
  const row = await d1().prepare("SELECT users.id, users.email, users.global_role AS role, users.first_name AS firstName, users.last_name AS lastName, users.phone, users.company_role AS companyRole, tenant_memberships.role AS tenantRole FROM sessions JOIN users ON users.id = sessions.user_id LEFT JOIN tenant_memberships ON tenant_memberships.tenant_id = sessions.tenant_id AND tenant_memberships.user_id = users.id WHERE sessions.token_hash = ? AND sessions.tenant_id = ? AND sessions.expires_at > ?").bind(await sha256(token), tenant.id, new Date().toISOString()).first<AuthIdentityRow>();
  if (!row || (row.role !== "admin" && !row.tenantRole)) return null;
  return userRecord(row, tenant);
}

export async function register(request: Request, email: string, password: string, profile: RegistrationProfile) {
  const tenant = await tenantForRequest(request);
  const normalized = normalizeEmail(email);
  const firstName = profile.firstName.trim().slice(0, 80);
  const lastName = (profile.lastName || "").trim().slice(0, 80);
  const phone = (profile.phone || "").trim().slice(0, 50);
  const companyRole = (profile.companyRole || "").trim().slice(0, 160);
  if (!firstName) throw new Error("Укажите имя.");
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Укажите корректный email.");
  if (password.length < 8) throw new Error("Пароль должен содержать не менее 8 символов.");
  if (await d1().prepare("SELECT id FROM users WHERE email = ?").bind(normalized).first()) throw new Error("Этот email уже зарегистрирован. Войдите в аккаунт.");
  const secured = await passwordHash(password);
  const user: AppUser = { id: crypto.randomUUID(), email: normalized, role: "user", tenantId: tenant.id, tenantSlug: tenant.slug, tenantRole: "member", firstName, lastName, phone, companyRole };
  const now = new Date().toISOString();
  await d1().batch([
    d1().prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, first_name, last_name, phone, company_role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(user.id, user.email, secured.hash, secured.salt, secured.algorithm, secured.iterations, user.role, user.firstName, user.lastName, user.phone, user.companyRole, now, now),
    d1().prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(tenant.id, user.id, user.tenantRole, now),
  ]);
  return user;
}

export async function login(request: Request, email: string, password: string) {
  const tenant = await tenantForRequest(request);
  const user = await d1().prepare("SELECT users.id, users.email, users.global_role AS role, users.first_name AS firstName, users.last_name AS lastName, users.phone, users.company_role AS companyRole, users.password_hash, users.password_salt, users.password_algorithm, users.password_iterations, tenant_memberships.role AS tenantRole FROM users LEFT JOIN tenant_memberships ON tenant_memberships.user_id = users.id AND tenant_memberships.tenant_id = ? WHERE users.email = ?").bind(tenant.id, normalizeEmail(email)).first<AuthIdentityRow>();
  if (!user || (user.role !== "admin" && !user.tenantRole)) throw new Error("Неверный email или пароль.");
  if (!await passwordMatches(password, { hash: user.password_hash, salt: user.password_salt, algorithm: user.password_algorithm, iterations: user.password_iterations })) throw new Error("Неверный email или пароль.");
  await d1().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  return userRecord(user, tenant)!;
}

export async function updateProfile(user: AppUser, profile: RegistrationProfile) {
  await ensureStore();
  const firstName = profile.firstName.trim().slice(0, 80);
  const lastName = (profile.lastName || "").trim().slice(0, 80);
  const phone = (profile.phone || "").trim().slice(0, 50);
  const companyRole = (profile.companyRole || "").trim().slice(0, 160);
  if (!firstName) throw new Error("Укажите имя.");
  await d1().prepare("UPDATE users SET first_name = ?, last_name = ?, phone = ?, company_role = ? WHERE id = ?").bind(firstName, lastName, phone, companyRole, user.id).run();
  return { ...user, firstName, lastName, phone, companyRole };
}

export async function changePassword(user: AppUser, currentPassword: string, newPassword: string) {
  await ensureStore();
  if (!currentPassword) throw new Error("Введите текущий пароль.");
  if (newPassword.length < 8) throw new Error("Новый пароль должен содержать не менее 8 символов.");
  if (currentPassword === newPassword) throw new Error("Новый пароль должен отличаться от текущего.");
  const stored = await d1().prepare("SELECT password_hash, password_salt, password_algorithm, password_iterations FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string; password_salt: string; password_algorithm: string; password_iterations: number }>();
  if (!stored) throw new Error("Пользователь не найден.");
  if (stored.password_algorithm !== PASSWORD_ALGORITHM || !Number.isInteger(stored.password_iterations) || stored.password_iterations < 100_000) throw new Error("Формат пароля не поддерживается.");
  if (!await passwordMatches(currentPassword, { hash: stored.password_hash, salt: stored.password_salt, algorithm: stored.password_algorithm, iterations: stored.password_iterations })) throw new Error("Текущий пароль указан неверно.");
  const next = await passwordHash(newPassword);
  await d1().prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_algorithm = ?, password_iterations = ? WHERE id = ?").bind(next.hash, next.salt, next.algorithm, next.iterations, user.id).run();
}

export async function createSession(user: AppUser) {
  await ensureStore();
  const token = randomValue();
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await d1().prepare("INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, user.tenantId, await sha256(token), expires.toISOString(), now.toISOString()).run();
  return token;
}

export async function deleteSession(request: Request) {
  const token = cookieValue(request);
  if (token) await d1().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function requireAdmin(request: Request) {
  const user = await currentUser(request);
  if (!user || (user.role !== "admin" && user.tenantRole !== "admin" && user.tenantRole !== "owner")) return null;
  return user;
}

export async function recordGeneration(user: AppUser, values: { operation: string; prompt: string; outputKey: string; contentType: string; bytes: number; inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null }) {
  await ensureStore();
  await d1().prepare("INSERT INTO generations (id, user_id, tenant_id, operation, prompt, output_key, content_type, bytes, input_tokens, output_tokens, total_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, user.tenantId, values.operation, values.prompt.slice(0, 2000), values.outputKey, values.contentType, values.bytes, values.inputTokens ?? null, values.outputTokens ?? null, values.totalTokens ?? null, new Date().toISOString()).run();
}

export const tenantStoragePrefix = (user: AppUser) => `tenants/${user.tenantSlug}/users/${user.id}`;
export function storage() {
  return objectStorage;
}
