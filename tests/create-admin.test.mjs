import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createGlobalAdmin, hashPassword, normalizeEmail, verifyPassword } from "../scripts/create-admin.mjs";

const testAdminPassword = ["test-only", "admin", "passphrase"].join("-");

test("create-admin creates a global admin without tenant membership", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE tenant_memberships (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id)
    )
  `);

  createGlobalAdmin(database, {
    email: "  ADMIN@Example.COM ",
    firstName: "Ada",
    lastName: "Lovelace",
    password: testAdminPassword,
    passwordConfirmation: testAdminPassword,
  });

  const user = database.prepare("SELECT * FROM users").get();
  assert.equal(user.email, "admin@example.com");
  assert.equal(user.global_role, "admin");
  assert.equal(user.first_name, "Ada");
  assert.equal(user.last_name, "Lovelace");
  assert.equal(user.password_algorithm, "pbkdf2-sha256");
  assert.equal(user.password_iterations, 600_000);
  assert.notEqual(user.password_hash, testAdminPassword);
  assert.equal(verifyPassword(testAdminPassword, {
    hash: user.password_hash,
    salt: user.password_salt,
    algorithm: user.password_algorithm,
    iterations: user.password_iterations,
  }), true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM tenant_memberships").get().count, 0);
  database.close();
});

test("create-admin rejects duplicate normalized email", () => {
  const database = new DatabaseSync(":memory:");
  const values = {
    email: "admin@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    password: testAdminPassword,
    passwordConfirmation: testAdminPassword,
  };
  createGlobalAdmin(database, values);
  assert.throws(() => createGlobalAdmin(database, { ...values, email: " ADMIN@EXAMPLE.COM " }), /уже существует/);
  database.close();
});

test("email normalization is stable", () => {
  assert.equal(normalizeEmail(" User@Example.COM "), "user@example.com");
});

test("password verification honors legacy and current stored iteration counts", () => {
  const legacy = hashPassword(testAdminPassword, undefined, 100_000);
  const current = hashPassword(testAdminPassword, undefined, 600_000);

  assert.equal(verifyPassword(testAdminPassword, legacy), true);
  assert.equal(verifyPassword(testAdminPassword, current), true);
  assert.equal(verifyPassword(testAdminPassword, { ...legacy, iterations: current.iterations }), false);
});
