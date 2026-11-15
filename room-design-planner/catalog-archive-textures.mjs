import { posix } from 'node:path';
import { createHash } from 'node:crypto';

export function archiveTextureChoices(names, objPath, materialText, productId, surfaceEditing = false) {
  const byPath = new Map();
  const add = (path, material) => {
    if (!names.includes(path) || !/\.(jpe?g|png)$/i.test(path)) return;
    const choice = byPath.get(path) ?? {
      id: createHash('sha256').update(path).digest('hex').slice(0, 24),
      label: posix.basename(path).replace(/\.[^.]+$/, '').replaceAll('_', ' '),
      path,
      materials: [],
    };
    if (material && !choice.materials.includes(material)) choice.materials.push(material);
    byPath.set(path, choice);
  };
  const folder = posix.dirname(objPath);
  if (surfaceEditing || productId === 'leve-home:334625_283') {
    // DEA's MTL has only wire colors. Its cabinet body uses this material across the four meshes.
    for (const path of names.filter(path => path.startsWith(`${folder}/textures/`))) {
      add(path, surfaceEditing ? undefined : 'wire_153228184');
    }
  } else {
    let material = '';
    for (const raw of materialText.split(/\r?\n/)) {
      const line = raw.trim();
      if (/^newmtl\s+/i.test(line)) material = line.replace(/^newmtl\s+/i, '');
      const map = line.match(/^map_Kd\s+([^-].*)$/i)?.[1];
      if (map && material) add(posix.normalize(posix.join(folder, map.replaceAll('\\', '/'))), material);
    }
  }
  return [...byPath.values()].slice(0, 16);
}

export function textureMime(bytes) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  throw Error('Неподдерживаемый файл текстуры');
}

export function embedArchiveTexture(glb, image, choice) {
  const jsonLength = glb.readUInt32LE(12);
  const data = JSON.parse(glb.subarray(20, 20 + jsonLength));
  const matched = (data.materials ?? []).filter(material => choice.materials.includes(material.name));
  if (!matched.length) throw Error('Для текстуры не найден материал модели');
  const buffer = glb.subarray(28 + jsonLength);
  data.bufferViews.push({ buffer: 0, byteOffset: buffer.length, byteLength: image.length });
  data.images ??= [];
  data.textures ??= [];
  const source = data.images.push({ bufferView: data.bufferViews.length - 1, mimeType: textureMime(image), name: choice.label }) - 1;
  const index = data.textures.push({ source }) - 1;
  for (const material of matched) {
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    material.pbrMetallicRoughness.baseColorTexture = { index };
  }
  const binary = Buffer.concat([buffer, image, Buffer.alloc((4 - image.length % 4) % 4)]);
  data.buffers[0].byteLength = binary.length;
  let json = Buffer.from(JSON.stringify(data));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.from(glb.subarray(0, 12));
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  const chunk = (bytes, type) => {
    const prefix = Buffer.alloc(8);
    prefix.writeUInt32LE(bytes.length, 0);
    prefix.writeUInt32LE(type, 4);
    return Buffer.concat([prefix, bytes]);
  };
  return Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(binary, 0x004e4942)]);
}
