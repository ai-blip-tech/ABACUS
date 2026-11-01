export function configFromEnv(env = process.env) {
  const positive = (key, fallback, max) => { const n=Number(env[key] ?? fallback); if (!Number.isFinite(n)||n<0||n>max) throw Error(`Некорректный ${key}`); return n; };
  return {
    root: env.MODEL3D_STORAGE_DIR || '/var/lib/room-design/model-library',
    port: positive('MODEL3D_PORT',4199,65535),
    secret: env.MODEL3D_SERVICE_SECRET || '',
    providerKey: env.RUNPOD_API_KEY || '',
    hfToken: env.HF_TOKEN || '',
    bundledWeights: env.MODEL3D_BUNDLED_WEIGHTS === 'true',
    enabled: env.MODEL3D_GENERATION_ENABLED === 'true',
    image: env.MODEL3D_RUNPOD_IMAGE || '',
    engineRevision: env.MODEL3D_ENGINE_REVISION || '',
    publicUrl: (env.MODEL3D_PUBLIC_URL || '').replace(/\/$/,''),
    namespace: env.MODEL3D_NAMESPACE || 'roomdesign-model3d',
    maxPods: Math.floor(positive('MODEL3D_MAX_PODS',1,8)),
    maxSeconds: Math.floor(positive('MODEL3D_MAX_JOB_SECONDS',900,1800)),
    hourlyUsd: positive('MODEL3D_GPU_HOURLY_USD',2.51,20),
    dailyBudgetUsd: positive('MODEL3D_DAILY_BUDGET_USD',0,1000),
    gpuType: env.MODEL3D_GPU_TYPE || 'NVIDIA RTX PRO 6000 Blackwell Server Edition',
    registryAuthId: env.MODEL3D_REGISTRY_AUTH_ID || '',
  };
}
