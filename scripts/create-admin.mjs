#!/usr/bin/env node

import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";

const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 600_000;
const MINIMUM_PASSWORD_LENGTH = 12;

export const normalizeEmail = (email) => email.trim().toLowerCase();

export function hashPassword(password, salt = randomBytes(32).toString("base64url"), iterations = PASSWORD_ITERATIONS) {
  const hash = pbkdf2Sync(password, Buffer.from(salt, "base64url"), iterations, 32, "sha256").toString("base64url");
  return { hash, salt, algorithm: PASSWORD_ALGORITHM, iterations };
}

export function verifyPassword(password, credential) {
  if (credential.algorithm !== PASSWORD_ALGORITHM) return false;
  const actual = Buffer.from(hashPassword(password, credential.salt, credential.iterations).hash, "base64url");
  const expected = Buffer.from(credential.hash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function ensureUserSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
      password_iterations INTEGER NOT NULL DEFAULT 600000,
      global_role TEXT NOT NULL DEFAULT 'user',
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      company_role TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    )
  `);

  const columns = new Set(database.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
  if (!columns.has("global_role") && columns.has("role")) {
    database.exec("ALTER TABLE users RENAME COLUMN role TO global_role");
    columns.add("global_role");
  }
  if (!columns.has("global_role")) database.exec("ALTER TABLE users ADD COLUMN global_role TEXT NOT NULL DEFAULT 'user'");
  if (!columns.has("password_algorithm")) database.exec("ALTER TABLE users ADD COLUMN password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256'");
  if (!columns.has("password_iterations")) database.exec("ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000");
}

export function createGlobalAdmin(database, values) {
  ensureUserSchema(database);
  const email = normalizeEmail(values.email);
  const firstName = values.firstName.trim().slice(0, 80);
  const lastName = values.lastName.trim().slice(0, 80);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Укажите корректный email.");
  if (!firstName) throw new Error("Укажите имя.");
  if (!lastName) throw new Error("Укажите фамилию.");
  if (values.password.length < MINIMUM_PASSWORD_LENGTH) throw new Error(`Пароль должен содержать не менее ${MINIMUM_PASSWORD_LENGTH} символов.`);
  if (values.password !== values.passwordConfirmation) throw new Error("Пароли не совпадают.");
  if (database.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new Error("Пользователь с таким email уже существует.");

  const credential = hashPassword(values.password);
  database.prepare(`
    INSERT INTO users (
      id, email, password_hash, password_salt, password_algorithm, password_iterations,
      global_role, first_name, last_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?)
  `).run(randomUUID(), email, credential.hash, credential.salt, credential.algorithm, credential.iterations, firstName, lastName, new Date().toISOString());
  return { email };
}

class MutedOutput extends Writable {
  muted = false;

  _write(chunk, encoding, callback) {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  }
}

async function promptForAdmin() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Команда требует интерактивный терминал.");
  const output = new MutedOutput();
  const input = createInterface({ input: process.stdin, output, terminal: true });
  const askSecret = async (prompt) => {
    process.stdout.write(prompt);
    output.muted = true;
    try {
      return await input.question("");
    } finally {
      output.muted = false;
      process.stdout.write("\n");
    }
  };

  try {
    return {
      email: await input.question("Email: "),
      firstName: await input.question("Имя: "),
      lastName: await input.question("Фамилия: "),
      password: await askSecret("Пароль: "),
      passwordConfirmation: await askSecret("Подтверждение пароля: "),
    };
  } finally {
    input.close();
  }
}

async function main() {
  const configuredDataRoot = process.env.ROOM_DESIGN_DATA_DIR || process.env.DATA_DIR;
  const dataRoot = resolve(configuredDataRoot || "data");
  if (!existsSync(dataRoot)) mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(resolve(dataRoot, "room-design.sqlite"));
  database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  try {
    const values = await promptForAdmin();
    createGlobalAdmin(database, values);
    process.stdout.write("Глобальный администратор Room Design успешно создан.\n");
  } finally {
    database.close();
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Не удалось создать администратора."}\n`);
    process.exitCode = 1;
  });
}
