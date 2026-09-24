import { currentUser, recordGeneration, storage, tenantStoragePrefix } from "@/lib/auth";
import { imageModel } from "@/lib/image-model";
import { openAIKey } from "@/lib/server-config";

async function generateResponse(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите или зарегистрируйтесь, чтобы запускать генерации." }, { status: 401 });
  const apiKey = openAIKey();
  if (!apiKey) return Response.json({ error: "Генерация не настроена на сервере: укажите действительный OPENAI_API_KEY и перезапустите PM2 с --update-env." }, { status: 503 });
  const model = imageModel();

  const body = await request.json() as { prompt?: string; preserved?: string[]; creativity?: string; product?: string; roomImage?: string; referenceImage?: string; outputSize?: string; removal?: { name?: string; mask?: string }; replacement?: { name?: string; mask?: string }; placement?: { x?: number; y?: number; mask?: string }; adjustment?: { instruction?: string; mask?: string }; upscale?: boolean; planRender?: { planImage?: string; room?: { width?: number; length?: number }; items?: Array<{ name?: string; width?: number; depth?: number; x?: number; y?: number; rotation?: number; referenceName?: string }>; referenceImages?: string[] } };
  const idea = body.prompt?.trim();
  if (!idea) return Response.json({ error: "Опишите идею для визуализации." }, { status: 400 });
  // The image edit endpoint accepts a small set of stable canvas sizes.  Older
  // client versions created arbitrary values such as 1536x864, which makes the
  // provider reject an otherwise valid furniture-replacement request.
  const requestedSize = body.outputSize || "";
  const [requestedWidth, requestedHeight] = requestedSize.split("x").map(Number);
  const outputSize = ["1024x1024", "1536x1024", "1024x1536"].includes(requestedSize)
    ? requestedSize
    : requestedWidth && requestedHeight
      ? requestedWidth / requestedHeight > 1.15
        ? "1536x1024"
        : requestedHeight / requestedWidth > 1.15
          ? "1024x1536"
          : "1024x1024"
      : "1536x1024";

  const preservation = body.preserved?.length ? `Preserve the following aspects conceptually: ${body.preserved.join(", ")}.` : "Feel free to reinterpret the whole space.";
  const product = body.product ? `Include this selected furniture item naturally in the composition: ${body.product}.` : "";
  const prompt = [
    "Create one photorealistic interior design visualisation of a premium residential living room.",
    `The designer's brief is: ${idea}`,
    preservation,
    `Creative direction: ${body.creativity || "Средняя"}.`,
    product,
    "Wide landscape architectural-interior photograph, believable proportions, refined materials and natural lighting.",
    "No people, no text, no logos, no watermark.",
  ].filter(Boolean).join("\n");

  const placementDescription = body.placement ? `The selected placement point is at ${Math.round(body.placement.x || 0)}% from the left and ${Math.round(body.placement.y || 0)}% from the top of the room image. Place the visual centre of the new item at that point.` : "";
  const editPrompt = [
    "Use the first image as the completed interior to preserve.",
    "Use the second image as the exact furniture reference.",
    "Add that specific furniture item naturally to the interior. Match the room's perspective, scale, lighting, material realism, contact shadows and colour. Do not replace the room or invent a different item.",
    placementDescription,
    "The transparent mask is the only permitted edit area. Keep all pixels outside it visually identical.",
    "No people, no text, no logos, no watermark.",
  ].join("\n");
  const catalogPlacementPrompt = [
    "Perform one local furniture addition in the first image of a completed interior.",
    `Add this item naturally: ${body.product || "selected furniture"}.`,
    placementDescription,
    "The transparent mask is the only permitted edit area. Preserve every pixel outside it visually identical. Match perspective, scale, lighting and contact shadows.",
    "No people, no text, no logos, no watermark.",
  ].join("\n");
  const adjustmentPrompt = body.adjustment?.instruction ? [
    "Perform one strictly local correction in a completed interior image.",
    `Apply this instruction only to the selected recently added object: ${body.adjustment.instruction}`,
    "The transparent mask is the only permitted edit area. Everything outside it must remain visually identical: do not move, alter, regenerate, crop, or retouch any other object, furniture, wall, floor, lighting, material, shadow, person, or composition.",
    "Keep image dimensions and camera framing exactly unchanged. No text, logos, or watermark.",
  ].join("\n") : "";
  const upscalePrompt = [
    "Perform a technical quality upscale of the supplied image.",
    "Preserve the image exactly: do not add, remove, move, restyle, regenerate, crop, or alter any object, person, furniture, décor, architecture, lighting, shadow, material, colour, camera angle, composition, logo, or text.",
    "Improve only resolution, edge clarity, compression artifacts, and fine material detail while keeping every element and its pixel position visually the same.",
    "No new content, no text, no logos, no watermark.",
  ].join("\n");
  const planRenderPrompt = [
    "Use the first image as a top-down floor plan that is the authoritative spatial brief for an interior render.",
    "Create one photorealistic eye-level interior visualisation that faithfully follows this plan: item placement, scale, circulation, and relative orientation must match.",
    body.prompt?.trim() || "Use a calm premium residential interior with light walls, natural wood flooring, and daylight.",
    body.planRender?.referenceImages?.length ? "The following images are mandatory visual references named in the brief. They may include floor and wall finishes as well as real furniture; follow the brief to apply each reference only to its specified element." : "Use furniture that matches the plan dimensions and categories.",
    "Keep the room dimensions and all objects proportional. Do not add extra furniture. No people, no text, no logos, no watermark.",
  ].join("\n");
  const replacementPrompt = body.replacement?.name ? [
    "Perform one strictly local furniture replacement in the first image of a finished interior.",
    `Replace only the selected existing object: ${body.replacement.name}.`,
    "The transparent area in the mask is the only permitted edit zone. The second image is the exact furniture reference to place there.",
    "Reproduce the furniture from the second image faithfully: preserve its exact number of modules, silhouette, proportions, upholstery, seams, legs, colour, and distinctive details. Do not simplify, reinterpret, combine, or invent another model.",
    "Do not add a second item. The reference furniture must occupy the position of the selected existing object only, with believable scale, perspective, contact shadows, and lighting.",
    "Everything outside the transparent mask must remain visually identical to the first image. Do not alter, remove, move, crop, regenerate, or retouch any other furniture, décor, table, wall, floor, lighting, material, shadow, or composition.",
    "Keep the original image dimensions and camera framing exactly unchanged. No people, no text, no logos, no watermark.",
  ].join("\n") : "";
  const removalPrompt = body.removal?.name ? [
    "Perform one strictly local edit on the first image of a finished interior.",
    `Remove only the selected object: ${body.removal.name}.`,
    "The transparent area in the mask is the only permitted edit zone. Modify pixels only inside that transparent mask.",
    "Everything outside the transparent mask must remain visually identical to the original: do not alter, regenerate, move, crop, restyle, add, remove, or retouch any other furniture, décor, wall, floor, lighting, object, material, shadow, or composition.",
    "Inside the masked area only, reconstruct the background that would naturally be visible behind the removed object, matching the immediately surrounding materials and lighting.",
    "Keep the original image dimensions and camera framing exactly unchanged.",
    "No people, no text, no logos, no watermark.",
  ].join("\n") : "";
  const dataUrlToBlob = (dataUrl: string) => {
    const [header, encoded] = dataUrl.split(",");
    const mediaType = header?.match(/^data:([^;]+);base64$/)?.[1];
    if (!mediaType || !encoded) throw new Error("Некорректный формат изображения.");
    return new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], { type: mediaType });
  };
  const imageSourceToBlob = async (source: string) => {
    if (source.startsWith("data:")) return dataUrlToBlob(source);
    let imageUrl: URL;
    try {
      imageUrl = new URL(source);
    } catch {
      throw new Error("Некорректная ссылка на изображение товара.");
    }
    if (imageUrl.protocol !== "https:" || !/(^|\.)norrmobler\.ru$/i.test(imageUrl.hostname)) {
      throw new Error("Источник изображения товара не поддерживается.");
    }
    const imageResponse = await fetch(imageUrl, { headers: { Accept: "image/*", "User-Agent": "ROOM-design-catalog/1.0" } });
    if (!imageResponse.ok) throw new Error("Не удалось загрузить фотографию товара из каталога.");
    const contentType = imageResponse.headers.get("content-type")?.split(";")[0] || "";
    if (!contentType.startsWith("image/")) throw new Error("Каталог вернул файл, который не является изображением.");
    const bytes = await imageResponse.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) throw new Error("Фотография товара имеет неподдерживаемый размер.");
    return new Blob([bytes], { type: contentType });
  };
  const sampleInteriorBlob = async () => {
    const sample = await fetch("https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=90");
    if (!sample.ok) throw new Error("Не удалось загрузить исходный интерьер.");
    return new Blob([await sample.arrayBuffer()], { type: sample.headers.get("content-type") || "image/jpeg" });
  };

  let response: Response;
  try {
    if (body.planRender?.planImage) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", planRenderPrompt);
      form.append("image[]", dataUrlToBlob(body.planRender.planImage), "floor-plan.png");
      const referenceImages = (body.planRender.referenceImages || []).slice(0, 8);
      const referenceBlobs = (await Promise.all(referenceImages.map(async (source) => {
        const image = await imageSourceToBlob(source);
        return ["image/jpeg", "image/png", "image/webp"].includes(image.type) ? image : null;
      }))).filter((image): image is Blob => Boolean(image));
      referenceBlobs.forEach((image, index) => form.append("image[]", image, `furniture-reference-${index + 1}.${image.type.split("/")[1] || "png"}`));
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
    } else if (body.roomImage && body.upscale) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", upscalePrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "source-image.png");
      form.append("size", outputSize);
      form.append("quality", "high");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
    } else if (body.roomImage && body.referenceImage && body.replacement?.mask) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", replacementPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "interior.png");
      const referenceBlob = await imageSourceToBlob(body.referenceImage);
      if (!referenceBlob) return Response.json({ error: "Не удалось загрузить фотографию товара из каталога." }, { status: 400 });
      form.append("image[]", referenceBlob, `furniture-reference.${referenceBlob.type.split("/")[1] || "jpg"}`);
      form.append("mask", dataUrlToBlob(body.replacement.mask), "replacement-area-mask.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
    } else if (body.roomImage && body.removal?.mask) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", removalPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "interior.png");
      form.append("mask", dataUrlToBlob(body.removal.mask), "selected-object-mask.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
    } else if (body.roomImage && body.adjustment?.mask) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", adjustmentPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "interior.webp");
      form.append("mask", dataUrlToBlob(body.adjustment.mask), "adjustment-area-mask.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
    } else if (body.roomImage && body.referenceImage && body.placement?.mask) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", editPrompt);
      form.append("image[]", body.roomImage === "sample-interior" ? await sampleInteriorBlob() : dataUrlToBlob(body.roomImage), "interior.webp");
      const referenceBlob = await imageSourceToBlob(body.referenceImage);
      if (!referenceBlob) return Response.json({ error: "Не удалось загрузить фотографию товара из каталога." }, { status: 400 });
      form.append("image[]", referenceBlob, `furniture-reference.${referenceBlob.type.split("/")[1] || "jpg"}`);
      form.append("mask", dataUrlToBlob(body.placement.mask), "placement-area-mask.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
    } else if (body.roomImage && body.product && body.placement?.mask) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", catalogPlacementPrompt);
      form.append("image[]", body.roomImage === "sample-interior" ? await sampleInteriorBlob() : dataUrlToBlob(body.roomImage), "interior.webp");
      form.append("mask", dataUrlToBlob(body.placement.mask), "placement-area-mask.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size: outputSize, quality: "medium", output_format: "webp" }),
      });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось подготовить изображения." }, { status: 400 });
  }
  const responseText = await response.text();
  let result: { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string }; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } } = {};
  try {
    result = JSON.parse(responseText);
  } catch {
    // A proxy or a transient gateway error can return HTML instead of JSON.
    // Keep the response actionable without exposing provider internals.
  }
  if (!response.ok) {
    console.error("Image edit failed", { status: response.status, operation: body.replacement ? "replace" : body.placement ? "place" : "generate", message: result.error?.message });
    return Response.json({ error: result.error?.message || `Сервис генерации временно недоступен (код ${response.status}). Попробуйте ещё раз.` }, { status: response.status });
  }

  const encodedImage = result.data?.[0]?.b64_json;
  if (!encodedImage) return Response.json({ error: "Изображение не вернулось от модели." }, { status: 502 });

  const binary = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
  const operation = body.planRender ? "plan_render" : body.upscale ? "upscale" : body.removal ? "remove" : body.replacement ? "replace" : body.placement ? "place" : body.adjustment ? "adjust" : "generate";
  const outputKey = `${tenantStoragePrefix(user)}/generations/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.webp`;
  try {
    await storage().put(outputKey, binary, { httpMetadata: { contentType: "image/webp" } });
    await recordGeneration(user, { operation, prompt: body.prompt || "", outputKey, contentType: "image/webp", bytes: binary.byteLength, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens, totalTokens: result.usage?.total_tokens });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить результат генерации." }, { status: 503 });
  }
  return new Response(binary, { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store" } });
}

// Keep route-level failures from being converted into an HTML 500 response by
// the hosting runtime. The client can then surface a useful message and a
// replacement attempt never fails silently before it reaches the image API.
export async function POST(request: Request) {
  try {
    return await generateResponse(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка сервера.";
    console.error("Image generation route failed", message);
    return Response.json({ error: `Не удалось подготовить задачу: ${message}` }, { status: 500 });
  }
}
