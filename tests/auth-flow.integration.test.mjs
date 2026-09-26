import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createGlobalAdmin, hashPassword } from "../scripts/create-admin.mjs";

const dataRoot = await mkdtemp(join(tmpdir(), "room-design-auth-test-"));
process.env.ROOM_DESIGN_DATA_DIR = dataRoot;

const adminEmail = "global-admin@example.test";
const adminPassword = ["test-only", "global-admin", "passphrase"].join("-");
const legacyEmail = "legacy-member@example.test";
const legacyPassword = ["test-only", "legacy-member", "passphrase"].join("-");
const orphanEmail = "orphan-user@example.test";
const databasePath = join(dataRoot, "room-design.sqlite");

const cliDatabase = new DatabaseSync(databasePath);
createGlobalAdmin(cliDatabase, {
  email: adminEmail,
  firstName: "Global",
  lastName: "Admin",
  password: adminPassword,
  passwordConfirmation: adminPassword,
});
cliDatabase.close();

const auth = await import("../lib/auth.ts");
const { database } = await import("../lib/server-runtime.ts");
await auth.ensureStore();

after(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

const request = (token) => new Request("http://localhost/api/auth/me", token ? { headers: { cookie: `room_session=${token}` } } : undefined);

async function insertUser({ id, email, password, iterations, membership }) {
  const credential = hashPassword(password, undefined, iterations);
  const now = new Date().toISOString();
  await database.prepare(`
    INSERT INTO users (
      id, email, password_hash, password_salt, password_algorithm,
      password_iterations, global_role, first_name, last_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)
  `).bind(id, email, credential.hash, credential.salt, credential.algorithm, credential.iterations, "Test", "User", now).run();
  await database.prepare("INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at) VALUES (?, ?, 'password', ?, ?, ?, ?)")
    .bind(`identity-${id}`, id, id, email, now, now).run();
  if (membership) {
    await database.prepare("INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
      .bind("tenant_norrmobler", id, now).run();
  }
}

test("global admin without membership can login, restore a session, and pass requireAdmin", async () => {
  const admin = await auth.login(request(), adminEmail, adminPassword);
  assert.equal(admin.role, "admin");
  assert.equal(admin.tenantRole, null);

  const token = await auth.createSession(admin);
  const sessionRequest = request(token);
  const current = await auth.currentUser(sessionRequest);
  const requiredAdmin = await auth.requireAdmin(sessionRequest);

  assert.equal(current?.email, adminEmail);
  assert.equal(current?.role, "admin");
  assert.equal(current?.tenantRole, null);
  assert.equal(requiredAdmin?.email, adminEmail);
  assert.equal((await auth.requireGlobalAdmin(sessionRequest))?.id, requiredAdmin?.id);
  assert.equal(await auth.requireTenantUser(sessionRequest), null);

  const membership = await database.prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE user_id = ?")
    .bind(admin.id).first();
  assert.equal(membership?.count, 0);

  const meRoute = await readFile(new URL("../app/api/auth/me/route.ts", import.meta.url), "utf8");
  assert.match(meRoute, /currentUser\(request\)/);
});

test("legacy member with 100000 PBKDF2 iterations can login", async () => {
  await insertUser({ id: "legacy-member", email: legacyEmail, password: legacyPassword, iterations: 100_000, membership: true });
  const user = await auth.login(request(), legacyEmail, legacyPassword);
  assert.equal(user.role, "user");
  assert.equal(user.tenantRole, "member");
});

test("ordinary global user can login globally but cannot use tenant-scoped authorization", async () => {
  await insertUser({ id: "orphan-user", email: orphanEmail, password: legacyPassword, iterations: 100_000, membership: false });
  const user = await auth.login(request(), orphanEmail, legacyPassword);
  assert.equal(user.tenantRole, null);
  const token = await auth.createSession(user);
  assert.equal((await auth.currentUser(request(token)))?.email, orphanEmail);
  assert.equal(await auth.requireTenantUser(request(token)), null);
});

test("tenant admin role does not grant global admin authorization", async () => {
  const email = "tenant-admin@example.test";
  await insertUser({ id: "tenant-admin", email, password: legacyPassword, iterations: 100_000, membership: true });
  await database.prepare("UPDATE tenant_memberships SET role = 'admin' WHERE user_id = 'tenant-admin'").run();
  const user = await auth.login(request(), email, legacyPassword);
  const token = await auth.createSession(user);
  assert.equal((await auth.requireAdmin(request(token)))?.id, "tenant-admin");
  assert.equal(await auth.requireGlobalAdmin(request(token)), null);
});
