const imageFromBlob = (blob: Blob) => new Promise<HTMLImageElement>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("Не удалось подготовить изображение для скачивания."));
  };
  image.src = objectUrl;
});

const canvasToJpeg = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob?.size) resolve(blob);
    else reject(new Error("Не удалось преобразовать изображение в JPEG."));
  }, "image/jpeg", 0.95);
});

export const jpegDownloadName = (name: string) => {
  const safeName = name.trim().replace(/[^a-zа-яё0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${safeName || "room-design-визуализация"}.jpg`;
};

export const imageSourceToJpeg = async (source: string) => {
  const response = await fetch(source);
  if (!response.ok) throw new Error("Не удалось загрузить изображение для скачивания.");
  const image = await imageFromBlob(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) throw new Error("Не удалось подготовить изображение для скачивания.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvasToJpeg(canvas);
};

export const downloadImageAsJpeg = async (source: string, name: string) => {
  const jpeg = await imageSourceToJpeg(source);
  const downloadUrl = URL.createObjectURL(jpeg);
  try {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = jpegDownloadName(name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(downloadUrl);
  }
};
