import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, writeSync, fsyncSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fingerprint, sha256, generationSettings, pngInput, validateGlb, HttpError, publicJob } from './contracts.mjs';

export function atomicFile(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o750 });
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o640);
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
  const dir = openSync(dirname(path), 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
}
export class ModelStore {
  constructor(root, options = {}) {
    this.root = root; this.revision = options.revision || 'unconfigured';
    mkdirSync(root, { recursive: true, mode: 0o750 });
    this.db = new DatabaseSync(join(root, 'library.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, fingerprint TEXT NOT NULL, settings_json TEXT NOT NULL, source_sha TEXT NOT NULL, created_at INTEGER NOT NULL, ready_at INTEGER, bytes INTEGER, file_sha TEXT, faces INTEGER, published INTEGER NOT NULL DEFAULT 0, rights_confirmed INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS assets_reuse ON assets(tenant_id,owner_id,fingerprint);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), tenant_id TEXT NOT NULL, owner_id TEXT NOT NULL, request_key TEXT NOT NULL, input_fingerprint TEXT NOT NULL, state TEXT NOT NULL, message TEXT NOT NULL, token_hash TEXT, pod_id TEXT, pod_name TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, provision_started INTEGER, deadline_at INTEGER, last_heartbeat INTEGER, progress TEXT, stop_state TEXT NOT NULL DEFAULT 'none', stop_attempts INTEGER NOT NULL DEFAULT 0, stop_error TEXT, reserved_usd REAL NOT NULL DEFAULT 0, settled_usd REAL, UNIQUE(tenant_id,owner_id,request_key));
      CREATE TABLE IF NOT EXISTS grants (asset_id TEXT NOT NULL REFERENCES assets(id), tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, receipt_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, PRIMARY KEY(asset_id,tenant_id,user_id));
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL, details TEXT NOT NULL);
    `);
  }
  transaction(work) { this.db.exec('BEGIN IMMEDIATE'); try { const result = work(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  file(id, filename = 'model.glb') {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'Модель не найдена.');
    return join(this.root, 'objects', id.slice(0, 2), id, filename);
  }
  event(id, kind, details = {}) { this.db.prepare('INSERT INTO events(job_id,kind,created_at,details) VALUES(?,?,?,?)').run(id, kind, Date.now(), JSON.stringify(details)); }
  job(id) { return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id); }
  ownedJob(id, user) { const job = this.job(id); if (!job || job.tenant_id !== user.tenantId || job.owner_id !== user.userId) throw new HttpError(404, 'Задание не найдено.'); return job; }
  asset(id, user) {
    const asset = this.db.prepare('SELECT * FROM assets WHERE id=?').get(id);
    if (!asset) throw new HttpError(404, 'Модель не найдена.');
    const owner = asset.tenant_id === user.tenantId && asset.owner_id === user.userId;
    const granted = this.db.prepare('SELECT 1 FROM grants WHERE asset_id=? AND tenant_id=? AND user_id=?').get(id, user.tenantId, user.userId);
    if (!owner && !granted) throw new HttpError(404, 'Модель не найдена.');
    return asset;
  }
  list(user) {
    return this.db.prepare('SELECT DISTINCT a.* FROM assets a LEFT JOIN grants g ON g.asset_id=a.id AND g.tenant_id=? AND g.user_id=? WHERE a.ready_at IS NOT NULL AND ((a.tenant_id=? AND a.owner_id=?) OR g.asset_id IS NOT NULL) ORDER BY a.created_at DESC LIMIT 100').all(user.tenantId,user.userId,user.tenantId,user.userId).map(a => this.metadata(a));
  }
  catalog(user) {
    return this.db.prepare('SELECT * FROM assets WHERE published=1 AND rights_confirmed=1 AND ready_at IS NOT NULL ORDER BY created_at DESC LIMIT 100').all().map(asset=>{
      let owned=false;try{this.asset(asset.id,user);owned=true;}catch{/* Listing a published model grants no download rights. */}
      return {...this.metadata(asset),modelUrl:owned?this.metadata(asset).modelUrl:null,owned};
    });
  }
  metadata(a) { return { id: a.id, name: a.name, settings: JSON.parse(a.settings_json), ready: Boolean(a.ready_at), bytes: a.bytes, sha256: a.file_sha, faces: a.faces, modelUrl: a.ready_at ? `/api/models3d/assets/${a.id}/file` : null }; }
  enqueue(user, input, key) {
    if (typeof key !== 'string' || !/^[\w-]{8,128}$/.test(key)) throw new HttpError(400, 'Нужен уникальный Idempotency-Key.');
    const settings = generationSettings(input), image = pngInput(input.imageBase64), hash = fingerprint(image, settings, this.revision);
    return this.transaction(() => {
      const duplicate = this.db.prepare('SELECT * FROM jobs WHERE tenant_id=? AND owner_id=? AND request_key=?').get(user.tenantId,user.userId,key);
      if (duplicate) { if (duplicate.input_fingerprint !== hash) throw new HttpError(409, 'Этот ключ уже использован для другого референса.'); return { job: publicJob(duplicate), reused: duplicate.state === 'succeeded' }; }
      const reusable = this.db.prepare(`SELECT a.* FROM assets a WHERE a.tenant_id=? AND a.owner_id=? AND a.fingerprint=? AND (a.ready_at IS NOT NULL OR EXISTS(SELECT 1 FROM jobs j WHERE j.asset_id=a.id AND j.state IN ('queued','provisioning','running'))) ORDER BY a.ready_at DESC LIMIT 1`).get(user.tenantId,user.userId,hash);
      if (reusable && !reusable.ready_at) {
        const active = this.db.prepare("SELECT * FROM jobs WHERE asset_id=? AND state IN ('queued','provisioning','running') LIMIT 1").get(reusable.id);
        return { job: publicJob(active), reused: false };
      }
      if (!reusable) {
        const active = this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE tenant_id=? AND owner_id=? AND state IN ('queued','provisioning','running')").get(user.tenantId,user.userId).n;
        const total = this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state IN ('queued','provisioning','running')").get().n;
        if (active >= 2 || total >= 100) throw new HttpError(429, 'Очередь заполнена. Дождитесь завершения текущего задания.');
      }
      const now = Date.now(), assetId = reusable?.id || randomUUID(), id = randomUUID();
      if (!reusable) {
        atomicFile(this.file(assetId, 'reference.png'), image);
        this.db.prepare('INSERT INTO assets(id,tenant_id,owner_id,name,fingerprint,settings_json,source_sha,created_at) VALUES(?,?,?,?,?,?,?,?)').run(assetId,user.tenantId,user.userId,String(input.name || '3D-модель').trim().slice(0,120),hash,JSON.stringify({...settings,engineRevision:this.revision}),sha256(image),now);
      }
      this.db.prepare('INSERT INTO jobs(id,asset_id,tenant_id,owner_id,request_key,input_fingerprint,state,message,created_at,updated_at,stop_state) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,assetId,user.tenantId,user.userId,key,hash,reusable?'succeeded':'queued',reusable?'Готовая модель найдена в библиотеке.':'В очереди.',now,now,reusable?'stopped':'none');
      this.event(id, reusable ? 'cache_hit' : 'queued');
      return { job: publicJob(this.job(id)), reused: Boolean(reusable) };
    });
  }
  complete(job, bytes) {
    const info = validateGlb(bytes);
    return this.transaction(() => {
      const current = this.job(job.id);
      if (current.state === 'succeeded') {
        const a = this.db.prepare('SELECT * FROM assets WHERE id=?').get(job.asset_id);
        if (a.file_sha !== info.sha256) throw new HttpError(409, 'У задания уже другой результат.');
        return { ...info, assetId: job.asset_id, durable: true };
      }
      if (!['provisioning','running'].includes(current.state) || current.deadline_at <= Date.now()) throw new HttpError(409, 'Время задания истекло.');
      atomicFile(this.file(job.asset_id), bytes);
      const now = Date.now();
      this.db.prepare('UPDATE assets SET ready_at=?,bytes=?,file_sha=?,faces=? WHERE id=?').run(now,info.bytes,info.sha256,info.faces,job.asset_id);
      this.db.prepare("UPDATE jobs SET state='succeeded',message='Модель готова.',updated_at=?,stop_state='pending' WHERE id=?").run(now,job.id);
      this.event(job.id, 'result_durable', info);
      return { ...info, assetId: job.asset_id, durable: true };
    });
  }
  grant(assetId, buyer, receiptId) {
    const asset = this.db.prepare('SELECT * FROM assets WHERE id=? AND ready_at IS NOT NULL AND published=1 AND rights_confirmed=1').get(assetId);
    if (!asset) throw new HttpError(409, 'Модель не опубликована для продажи.');
    if (!/^[\w:-]{8,160}$/.test(receiptId || '')) throw new HttpError(400, 'Нужна подтверждённая квитанция.');
    this.transaction(() => {
      const receipt = this.db.prepare('SELECT * FROM grants WHERE receipt_id=?').get(receiptId);
      if (receipt && (receipt.asset_id !== assetId || receipt.tenant_id !== buyer.tenantId || receipt.user_id !== buyer.userId)) throw new HttpError(409, 'Квитанция уже использована.');
      this.db.prepare('INSERT OR IGNORE INTO grants(asset_id,tenant_id,user_id,receipt_id,created_at) VALUES(?,?,?,?,?)').run(assetId,buyer.tenantId,buyer.userId,receiptId,Date.now());
    });
    return this.metadata(asset);
  }
  readReady(asset) {
    if (!asset.ready_at) throw new HttpError(409, 'Модель ещё не готова.');
    if (!existsSync(this.file(asset.id))) throw new HttpError(503, 'Файл модели требует восстановления из резервной копии.');
    const bytes=readFileSync(this.file(asset.id));
    if(sha256(bytes)!==asset.file_sha)throw new HttpError(503,'Контрольная сумма модели не совпадает. Требуется восстановление.');
    return bytes;
  }
  close() { this.db.close(); }
}
