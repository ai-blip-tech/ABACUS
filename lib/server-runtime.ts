import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

type QueryResult<T = Record<string, unknown>> = { success: true; results: T[]; meta: { changes: number | bigint } };

class NodeBoundStatement {
  constructor(private readonly database: DatabaseSync, private readonly sql: string, private readonly values: any[] = []) {}
  bind(...values: any[]) { return new NodeBoundStatement(this.database, this.sql, values); }
  async run(): Promise<QueryResult> {
    const statement = this.database.prepare(this.sql);
    const result = statement.run(...this.values);
    return { success: true, results: [], meta: { changes: result.changes } };
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    return { success: true, results: this.database.prepare(this.sql).all(...this.values) as T[], meta: { changes: 0 } };
  }
  execute(): QueryResult {
    const statement = this.database.prepare(this.sql);
    if (statement.columns().length > 0) return { success: true, results: statement.all(...this.values) as Record<string, unknown>[], meta: { changes: 0 } };
    const result = statement.run(...this.values);
    return { success: true, results: [], meta: { changes: result.changes } };
  }
}

class NodeDatabase {
  private readonly database: DatabaseSync;
  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    // `next build` evaluates route modules in several worker processes. Changing
    // journal mode during module import makes those workers contend for the same
    // database lock, so keep import-time setup read-only and process-safe.
    this.database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  }
  prepare(sql: string) { return new NodeBoundStatement(this.database, sql); }
  async batch(statements: NodeBoundStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

type StoredMetadata = { contentType?: string; customMetadata?: Record<string, string> };

class NodeObjectStorage {
  constructor(private readonly root: string) { mkdirSync(root, { recursive: true }); }
  private pathFor(key: string) {
    const target = resolve(/* turbopackIgnore: true */ this.root, ...key.split("/").filter(Boolean));
    const root = resolve(this.root);
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Некорректный ключ файла.");
    return target;
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    const target = this.pathFor(key);
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, value instanceof Uint8Array ? value : new Uint8Array(value));
    renameSync(temporary, target);
    writeFileSync(`${target}.metadata.json`, JSON.stringify({ contentType: options?.httpMetadata?.contentType, customMetadata: options?.customMetadata } satisfies StoredMetadata));
  }
  async get(key: string) {
    const target = this.pathFor(key);
    try {
      const body = readFileSync(target);
      let metadata: StoredMetadata = {};
      try { metadata = JSON.parse(readFileSync(`${target}.metadata.json`, "utf8")) as StoredMetadata; } catch { /* metadata is optional */ }
      return {
        body: new Uint8Array(body),
        httpEtag: createHash("sha256").update(body).digest("hex"),
        httpMetadata: { contentType: metadata.contentType },
        customMetadata: metadata.customMetadata,
        size: statSync(target).size,
        writeHttpMetadata(headers: Headers) { if (metadata.contentType) headers.set("Content-Type", metadata.contentType); },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}

const configuredDataRoot = process.env.ROOM_DESIGN_DATA_DIR || process.env.DATA_DIR;
const dataRoot = configuredDataRoot
  ? resolve(/* turbopackIgnore: true */ configuredDataRoot)
  : join(process.cwd(), "data");
mkdirSync(dataRoot, { recursive: true });

export const database = new NodeDatabase(join(dataRoot, "room-design.sqlite"));
export const objectStorage = new NodeObjectStorage(join(dataRoot, "storage"));
export const runtimeDataRoot = dataRoot;
