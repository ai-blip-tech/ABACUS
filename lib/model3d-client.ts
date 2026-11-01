export type Model3DJob={id:string;assetId:string;status:'queued'|'provisioning'|'running'|'succeeded'|'failed';message:string;modelUrl:string|null;gpuStopped:boolean};
export type Model3DSettings={widthMm:number;depthMm:number;heightMm:number;resolution?:'512'|'1024'};
export async function submitModel3D(input:Model3DSettings & {name:string;imageDataUrl?:string;catalogProductId?:string},options:{requestId:string;apiBase?:string;signal?:AbortSignal}){
  const base=options.apiBase||'/api/models3d';
  const response=await fetch(`${base}/jobs`,{method:'POST',credentials:'same-origin',signal:options.signal,headers:{'Content-Type':'application/json','Idempotency-Key':options.requestId},body:JSON.stringify(input)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось создать задание.');
  return data as {job:Model3DJob;reused:boolean};
}
export async function getModel3DJob(id:string,apiBase='/api/models3d',signal?:AbortSignal):Promise<Model3DJob>{
  const response=await fetch(`${apiBase}/jobs/${encodeURIComponent(id)}`,{credentials:'same-origin',cache:'no-store',signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось проверить модель.');return data.job;
}
export async function waitForModel3D(id:string,options:{apiBase?:string;signal?:AbortSignal;onProgress?:(job:Model3DJob)=>void}={}){
  while(true){
    options.signal?.throwIfAborted();
    const job=await getModel3DJob(id,options.apiBase,options.signal);options.onProgress?.(job);
    if(job.status==='succeeded')return job;
    if(job.status==='failed')throw Object.assign(Error(job.message),{jobStatus:'failed',jobId:job.id});
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(options.signal?.reason||new DOMException('Aborted','AbortError'));};
      const timer=setTimeout(()=>{options.signal?.removeEventListener('abort',abort);resolve();},2500);
      options.signal?.addEventListener('abort',abort,{once:true});
    });
  }
}
