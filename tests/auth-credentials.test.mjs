import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authSource = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
const createAdminSource = await readFile(new URL("../scripts/create-admin.mjs", import.meta.url), "utf8");

test("login verifies the password with the stored algorithm and iteration count", () => {
  assert.match(authSource, /users\.password_algorithm, users\.password_iterations/);
  assert.match(authSource, /passwordMatches\(password, \{ hash: user\.password_hash, salt: user\.password_salt, algorithm: user\.password_algorithm, iterations: user\.password_iterations \}\)/);
  assert.doesNotMatch(authSource, /password_iterations\s*\|\|/);
});

test("create-admin never creates a tenant membership", () => {
  assert.doesNotMatch(createAdminSource, /tenant_memberships|tenant_norrmobler/);
});
