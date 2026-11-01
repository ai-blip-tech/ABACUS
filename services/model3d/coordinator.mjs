import { randomBytes } from 'node:crypto';
import { statfsSync } from 'node:fs';
import { sha256 } from './contracts.mjs';
import { stoppedPod } from './runpod.mjs';

export class Coordinator {
  constructor(store, provider, config) { this.store = store; this.db = store.db; this.provider = provider; this.config = config; this.busy = false; }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // Reconciliation runs even when generation is disabled or the daily budget is exhausted.
      let pods;
      try { pods = await this.provider.list(); }
      catch {
        // An unavailable list endpoint must not prevent stopping a known expired Pod.
        const known=this.db.prepare("SELECT * FROM jobs WHERE pod_id IS NOT NULL AND (stop_state='pending' OR deadline_at<=?) AND stop_state!='stopped'").all(Date.now());
        for(const job of known){
          if(['provisioning','running'].includes(job.state))this.fail(job.id,'Истекло время работы GPU.');
          try{await this.provider.stop(job.pod_id);}catch{console.error('[model3d] direct stop will retry',job.id);}
        }
        return;
      }
      await this.reconcile(pods);
      if (!this.config.enabled) return;
      const unsafe = this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stop_state='pending'").get().n;
      if (unsafe) return; // Do not rent more GPUs while a previous GPU cannot be stopped.
      const active = this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state IN ('provisioning','running')").get().n;
      if (active >= this.config.maxPods) return;
      const next = this.db.prepare("SELECT * FROM jobs WHERE state='queued' ORDER BY created_at LIMIT 1").get();
      if (next) await this.provision(next);
    } finally { this.busy = false; }
  }
  async reconcile(pods) {
    const now = Date.now();
    const tracked = this.db.prepare("SELECT * FROM jobs WHERE state IN ('provisioning','running') OR stop_state='pending'").all();
    for (const job of tracked) {
      let pod = pods.find(p => p.id === job.pod_id || p.name === job.pod_name);
      if (!job.pod_id && pod) {
        this.db.prepare('UPDATE jobs SET pod_id=? WHERE id=?').run(pod.id,job.id);
        job.pod_id = pod.id;
      }
      if (job.deadline_at && now >= job.deadline_at && ['provisioning','running'].includes(job.state)) {
        this.fail(job.id, 'Не удалось завершить модель за отведённое время.');
        job.state = 'failed'; job.stop_state = 'pending';
      }
      if (job.pod_id && stoppedPod(pod)) {
        if (['provisioning','running'].includes(job.state)) this.fail(job.id, 'GPU был остановлен до получения результата.');
        this.settle(job, now);
        continue;
      }
      if (job.pod_id && !pod) {
        // The authoritative list may lag immediately after creation. Never provision a replacement.
        if (now - job.provision_started > 120000) {
          if (['provisioning','running'].includes(job.state)) this.fail(job.id, 'GPU недоступен.');
          this.settle(job, now);
        }
        continue;
      }
      if (job.stop_state === 'pending' && job.pod_id) {
        try {
          await this.provider.stop(job.pod_id);
          this.db.prepare('UPDATE jobs SET stop_attempts=stop_attempts+1,stop_error=NULL WHERE id=?').run(job.id);
          this.store.event(job.id, 'stop_requested');
        } catch (error) {
          this.db.prepare('UPDATE jobs SET stop_attempts=stop_attempts+1,stop_error=? WHERE id=?').run(String(error.message).slice(0,160),job.id);
          console.error('[model3d] stop failed', { jobId: job.id, podId: job.pod_id });
        }
      }
      if (!job.pod_id && job.deadline_at && now >= job.deadline_at) {
        // Retain a pending stop tombstone: a timed-out create can appear late in the provider list.
        this.db.prepare("UPDATE jobs SET stop_state='pending' WHERE id=?").run(job.id);
      }
    }
    // Catch duplicate/orphan Pods even after process restarts or ambiguous HTTP responses.
    const managed = pods.filter(p => p.name?.startsWith(`${this.config.namespace}-`));
    for (const pod of managed) {
      if (stoppedPod(pod)) continue;
      const job = this.db.prepare('SELECT * FROM jobs WHERE pod_name=?').get(pod.name);
      if (!job || job.pod_id && job.pod_id !== pod.id || job.deadline_at <= now || ['failed','succeeded'].includes(job.state)) {
        try { await this.provider.stop(pod.id); } catch { console.error('[model3d] orphan stop failed', { podId: pod.id }); }
      }
    }
  }
  fail(id, message) {
    this.db.prepare("UPDATE jobs SET state='failed',message=?,updated_at=?,stop_state=CASE WHEN provision_started IS NOT NULL THEN 'pending' ELSE 'none' END WHERE id=? AND state!='succeeded'").run(message,Date.now(),id);
    this.store.event(id, 'failed', { message });
  }
  settle(job, now) {
    const seconds = Math.max(0, (now - (job.provision_started || now)) / 1000);
    this.db.prepare("UPDATE jobs SET stop_state='stopped',settled_usd=?,updated_at=? WHERE id=?").run(seconds / 3600 * this.config.hourlyUsd,now,job.id);
  }
  async provision(job) {
    const c = this.config;
    if (!/@sha256:[a-f0-9]{64}$/.test(c.image) || !c.engineRevision || !c.publicUrl.startsWith('https://')) throw new Error('Model3D: нужен готовый образ по digest, ревизия и HTTPS callback.');
    const disk = statfsSync(this.store.root);
    if (disk.bavail * disk.bsize < 2 * 1024 ** 3) { this.fail(job.id, 'В хранилище моделей недостаточно свободного места.'); return; }
    const reservation = (c.maxSeconds + 60) / 3600 * c.hourlyUsd;
    const day = new Date().setUTCHours(0,0,0,0);
    const total = this.db.prepare('SELECT COALESCE(SUM(COALESCE(settled_usd,reserved_usd)),0) AS n FROM jobs WHERE provision_started>=?').get(day).n;
    if (total + reservation > c.dailyBudgetUsd) {
      this.db.prepare("UPDATE jobs SET message='Достигнут суточный лимит GPU. Задание сохранено в очереди.',updated_at=? WHERE id=?").run(Date.now(),job.id);
      return;
    }
    const now = Date.now(), token = randomBytes(32).toString('hex'), name = `${c.namespace}-${job.id}`;
    // Persist the reservation BEFORE POST. A failed POST is never blindly retried.
    const changed = this.db.prepare("UPDATE jobs SET state='provisioning',message='Запускаем GPU.',token_hash=?,pod_name=?,provision_started=?,deadline_at=?,updated_at=?,reserved_usd=? WHERE id=? AND state='queued'").run(sha256(token),name,now,now+c.maxSeconds*1000,now,reservation,job.id);
    if (!changed.changes) return;
    const body = { name, imageName: c.image, computeType: 'GPU', cloudType: 'SECURE', gpuCount: 1, gpuTypeIds: [c.gpuType], containerDiskInGb: 50, volumeInGb: 0, ports: [], supportPublicIp: false, env: { MODEL3D_JOB_ID: job.id, MODEL3D_JOB_TOKEN: token, MODEL3D_CALLBACK_URL: c.publicUrl, MODEL3D_DEADLINE_MS: String(now+c.maxSeconds*1000), MODEL3D_ENGINE_REVISION: c.engineRevision } };
    if(!c.bundledWeights&&c.hfToken)body.env.HF_TOKEN=c.hfToken;
    if (c.registryAuthId) body.containerRegistryAuthId = c.registryAuthId;
    try {
      const pod = await this.provider.create(body);
      if (!pod?.id) throw new Error('RunPod не вернул ID.');
      this.db.prepare('UPDATE jobs SET pod_id=?,updated_at=? WHERE id=?').run(pod.id,Date.now(),job.id);
      this.store.event(job.id, 'pod_created', { podId: pod.id, reservationUsd: reservation });
      if(Number(pod.costPerHr)>c.hourlyUsd){this.fail(job.id,'Тариф GPU превышает установленный лимит.');await this.provider.stop(pod.id);}
    } catch {
      this.db.prepare("UPDATE jobs SET message='Уточняем состояние запуска GPU.',updated_at=? WHERE id=?").run(Date.now(),job.id);
      this.store.event(job.id, 'create_uncertain');
    }
  }
}
