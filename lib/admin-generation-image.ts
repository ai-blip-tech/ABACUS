import sharp from "sharp";

export async function adminGenerationThumbnail(source: Uint8Array) {
  return sharp(Buffer.from(source))
    .rotate()
    .resize({ width: 480, height: 320, fit: "cover", position: "attention", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
}
