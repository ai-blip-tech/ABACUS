/** Copy the provider result only where the edit mask is transparent. */
export function compositeMaskedPixels(
  original: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  mask: Uint8ClampedArray,
): Uint8ClampedArray {
  if (original.length !== generated.length || original.length !== mask.length || original.length % 4 !== 0) {
    throw new Error("Размеры изображения и маски не совпадают.");
  }
  const result = new Uint8ClampedArray(original);
  for (let index = 0; index < result.length; index += 4) {
    const edit = 1 - mask[index + 3] / 255;
    if (edit <= 0) continue;
    for (let channel = 0; channel < 4; channel++) {
      result[index + channel] = Math.round(original[index + channel] * (1 - edit) + generated[index + channel] * edit);
    }
  }
  return result;
}
