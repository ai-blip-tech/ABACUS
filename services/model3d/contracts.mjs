import { createHash, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function equalSecret(a, b) {
  if (!a || !b) return false;
  return timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));
}
export function principal(headers) {
  const tenantId = headers['x-model-tenant'], userId = headers['x-model-user'];
  if (![tenantId, userId].every(v => typeof v === 'string' && /^[\w-]{1,100}$/.test(v))) throw new HttpError(401, 'Требуется вход.');
  return { tenantId, userId, admin: headers['x-model-admin'] === '1' };
}
export function generationSettings(input) {
  const dimensions = Object.fromEntries(['widthMm', 'depthMm', 'heightMm'].map(k => [k, Number(input[k])]));
  if (!Object.values(dimensions).every(v => Number.isFinite(v) && v >= 10 && v <= 20000)) throw new HttpError(400, 'Укажите реальные ширину, глубину и высоту от 10 до 20 000 мм.');
  const resolution = input.resolution ?? '1024';
  if (!['512', '1024'].includes(resolution)) throw new HttpError(400, 'Некорректное разрешение.');
  return { ...dimensions, resolution, seed: 42, textureSize: 2048, maxFaces: 50000 };
}
export function pngInput(value) {
  if (typeof value !== 'string' || value.length > 14 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new HttpError(400, 'Некорректный референс.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 24 || bytes.length > 10 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new HttpError(400, 'Нужен PNG до 10 МБ.');
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
  if (!w || !h || w > 4096 || h > 4096 || w * h > 16_000_000) throw new HttpError(400, 'Референс слишком большой.');
  return bytes;
}
export function validateGlb(bytes) {
  if (bytes.length < 24 || bytes.length > 50 * 1024 * 1024 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new HttpError(422, 'Повреждённый GLB.');
  const length = bytes.readUInt32LE(12);
  if (length > 4 * 1024 * 1024 || length + 20 > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new HttpError(422, 'Повреждённый GLB manifest.');
  let gltf;
  try { gltf = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')); } catch { throw new HttpError(422, 'Некорректный GLB JSON.'); }
  if (!gltf.asset?.version?.startsWith('2.') || !gltf.meshes?.length || !gltf.buffers?.length) throw new HttpError(422, 'В GLB нет модели.');
  if ([...(gltf.buffers || []), ...(gltf.images || [])].some(v => v.uri !== undefined)) throw new HttpError(422, 'GLB должен содержать все ресурсы внутри файла.');
  let faces = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives || []) {
    const count = gltf.accessors?.[primitive.indices]?.count;
    if ((primitive.mode ?? 4) !== 4 || !Number.isSafeInteger(count) || count <= 0 || count % 3) throw new HttpError(422, 'Некорректная геометрия GLB.');
    faces += count / 3;
  }
  if (!faces || faces > 1_000_000) throw new HttpError(422, 'Некорректное число полигонов.');
  return { bytes: bytes.length, sha256: sha256(bytes), faces };
}
export function fingerprint(image, settings, revision) {
  // Dimensions affect the fitted Pascal object, so changes produce a new asset.
  return sha256(Buffer.concat([image, Buffer.from(JSON.stringify({ settings, revision }))]));
}
export function publicJob(row) {
  return { id: row.id, assetId: row.asset_id, status: row.state, message: row.message, createdAt: row.created_at, updatedAt: row.updated_at, gpuStopped: row.stop_state === 'stopped', modelUrl: row.state === 'succeeded' ? `/api/models3d/assets/${row.asset_id}/file` : null };
}
