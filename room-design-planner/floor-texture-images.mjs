// SVGs loaded as images cannot fetch nested images. Embed every visible decor,
// including per-tile replacements, without changing the saved scene metadata.
const pendingImages = new Map();

export function floorImageURL(source, parentOrigin) {
  const url = new URL(source, parentOrigin);
  if (url.pathname === '/api/catalog/floor-texture') url.searchParams.set('v', '3');
  return url.href;
}

async function loadImage(url) {
  if (!pendingImages.has(url)) {
    const pending = (async () => {
      // Protected project/parquet assets need the current same-origin session.
      const response = await fetch(url, {credentials: 'same-origin'});
      if (!response.ok) throw Error('Изображение покрытия пола не загрузилось');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error('Не удалось прочитать изображение покрытия'));
        reader.readAsDataURL(blob);
      });
    })().catch(error => { pendingImages.delete(url); throw error; });
    pendingImages.set(url, pending);
    // Keep the cache bounded when users browse many different materials.
    if (pendingImages.size > 64) pendingImages.delete(pendingImages.keys().next().value);
  }
  return pendingImages.get(url);
}

export async function embedFloorImages(region, parentOrigin, embed = loadImage) {
  const next = structuredClone(region), images = new Map();
  const image = async source => {
    if (source.startsWith('data:')) return source;
    const url = floorImageURL(source, parentOrigin);
    if (!images.has(url)) images.set(url, embed(url));
    return images.get(url);
  };
  const product = async value => {
    if (!value) return;
    if (value.image) value.image = await image(value.image);
    if (value.tile?.image) value.tile.image = await image(value.tile.image);
  };
  await Promise.all([
    next.tile?.image ? image(next.tile.image).then(value => { next.tile.image = value; }) : null,
    product(next.product),
    ...Object.values(next.tileCells || {}).map(cell => product(cell.product)),
  ]);
  return next;
}
