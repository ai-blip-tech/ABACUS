// Invoked by a separate systemd timer. It never starts GPUs or generates models.
import {configFromEnv} from './config.mjs';
import {ModelStore} from './store.mjs';
import {Runpod,stoppedPod} from './runpod.mjs';
const config=configFromEnv();
if(!config.providerKey)process.exit(0);
const store=new ModelStore(config.root,{revision:config.engineRevision});
try {
  const provider=new Runpod(config.providerKey),now=Date.now();
  const known=store.db.prepare("SELECT * FROM jobs WHERE pod_id IS NOT NULL AND stop_state!='stopped' AND (deadline_at<=? OR stop_state='pending')").all(now);
  for(const job of known){try{await provider.stop(job.pod_id);}catch{console.error('[model3d-watchdog] direct stop failed',job.pod_id);}}
  const pods=await provider.list();
  for(const pod of pods){
    if(!pod.name?.startsWith(config.namespace+'-')||stoppedPod(pod))continue;
    const job=store.db.prepare('SELECT * FROM jobs WHERE pod_name=?').get(pod.name);
    if(!job||job.pod_id&&job.pod_id!==pod.id||job.deadline_at<=now||['succeeded','failed'].includes(job.state)){
      try{await provider.stop(pod.id);}catch{console.error('[model3d-watchdog] stop failed',pod.id);process.exitCode=1;}
    }
  }
}finally{store.close();}
