import { recordGeneration, requireTenantUser, storage, tenantStoragePrefix } from "@/lib/auth";
import { refundAiTokens, reserveAiTokens } from "@/lib/billing";
import { imageModel } from "@/lib/image-model";
import { openAIKey } from "@/lib/server-config";
import { database } from "@/lib/server-runtime";

async function generateResponse(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Войдите или зарегистрируйтесь, чтобы запускать генерации." }, { status: 401 });
  const apiKey = openAIKey();
  if (!apiKey) return Response.json({ error: "Генерация не настроена на сервере: укажите действительный OPENAI_API_KEY и перезапустите PM2 с --update-env." }, { status: 503 });
  const model = imageModel();

  const body = await request.json() as { operation?: string; prompt?: string; preserved?: string[]; creativity?: string; product?: string; roomImage?: string; referenceImage?: string; outputSize?: string; pointEdit?: { x?: number; y?: number; markedImage?: string }; furnitureCasting?: { markedImage?: string; items?: Array<{ x?: number; y?: number; name?: string; referenceImage?: string }> }; removal?: { name?: string }; replacement?: { name?: string }; placement?: { x?: number; y?: number }; adjustment?: { instruction?: string; mask?: string }; globalEdit?: { instruction?: string }; material?: { instruction?: string }; upscale?: boolean; planRender?: { planImage?: string; room?: { width?: number; length?: number }; items?: Array<{ name?: string; width?: number; depth?: number; x?: number; y?: number; rotation?: number; referenceName?: string }>; referenceImages?: string[] } };
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

  const pointDescription = body.pointEdit ? `The marker centre is at ${Math.round(body.pointEdit.x || 0)}% from the left and ${Math.round(body.pointEdit.y || 0)}% from the top.` : "";
  const editPrompt = [
    "Use image 1 as the clean completed interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. The marker centre is the insertion location and must not appear in the result.",
    "Use image 3 as the exact furniture reference. Add that specific furniture item naturally at the marked location.",
    pointDescription,
    "Match perspective, scale, lighting, material realism and contact shadows. Preserve the rest of the room as closely as possible.",
    "No people, no text, no logos, no watermark.",
  ].join("\n");
  const furnitureCastingItems = body.furnitureCasting?.items || [];
  const furnitureCastingPrompt = [
    "Create one unified photorealistic edit that places every supplied furniture reference into the room at the same time.",
    "Image 1 is the clean original room and is the composition, camera, architecture and lighting source to preserve.",
    "Image 2 is the same room with numbered location markers. Remove every marker from the final result.",
    ...furnitureCastingItems.map((item, index) => `Image ${index + 3} is furniture item ${index + 1}${item.name ? ` (${item.name})` : ""}. Place it exactly once at marker ${index + 1}, centred near ${Math.round(item.x || 0)}% from the left and ${Math.round(item.y || 0)}% from the top.`),
    `The final room must contain all ${furnitureCastingItems.length} supplied furniture items together in one coherent image. Do not omit an item and do not return intermediate variants.`,
    "Match believable scale, perspective, lighting, occlusion and contact shadows for every inserted item. Preserve everything else in the room as closely as possible.",
    "Return exactly one final image. No people, no text, no logos, no watermark.",
  ].join("\n");
  const catalogPlacementPrompt = [
    "Use image 1 as the clean completed interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. The marker centre is the insertion location and must not appear in the result.",
    `Add this item naturally: ${body.product || "selected furniture"}.`,
    pointDescription,
    "Match perspective, scale, lighting and contact shadows. Preserve the rest of the room as closely as possible.",
    "No people, no text, no logos, no watermark.",
  ].join("\n");
  const adjustmentPrompt = body.adjustment?.instruction ? [
    "Perform one strictly local correction in a completed interior image.",
    `Apply this instruction only to the selected recently added object: ${body.adjustment.instruction}`,
    "The transparent mask is the only permitted edit area. Everything outside it must remain visually identical: do not move, alter, regenerate, crop, or retouch any other object, furniture, wall, floor, lighting, material, shadow, person, or composition.",
    "Keep image dimensions and camera framing exactly unchanged. No text, logos, or watermark.",
  ].join("\n") : "";
  const globalEditPrompt = body.globalEdit?.instruction ? [
    "Edit the first image as one coherent completed interior while preserving its dimensions and camera framing.",
    `Apply the user's instruction to the current image: ${body.globalEdit.instruction}`,
    "Change only what the instruction requires. Preserve all unrelated architecture, furniture, materials, lighting, people, perspective, and composition.",
    "Return a photorealistic full-frame result. No text, logos, or watermark unless the user's instruction explicitly requires existing text to remain.",
  ].join("\n") : "";
  const materialPrompt = body.material ? [
    "Use image 1 as the clean completed interior.",
    "Image 2 is the same interior with a temporary crosshair marker. Identify the complete semantic object or surface containing the marker centre. The marker must not appear in the result.",
    "Use image 3 exclusively as a source of colour, material, texture, pattern, finish, and surface character, even when it depicts a complete object.",
    pointDescription,
    body.material.instruction || "Transfer the referenced material to the selected surface.",
    "Preserve the selected object's exact identity, silhouette, geometry, shape, dimensions, construction, position, perspective, seams, and surrounding scene.",
    "Do not add, insert, copy, reconstruct, or reproduce the object depicted in the reference. Do not replace the selected object with the reference object or change its furniture category.",
    "Change predominantly the selected object's surface. Preserve the surrounding scene as closely as possible.",
    "Match the existing lighting and shadows. No new objects, people, text, logos, or watermark.",
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
    "Use image 1 as the clean finished interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. Identify the complete semantic object containing the marker centre; the marker must not appear in the result.",
    `Replace only that selected object: ${body.replacement.name}.`,
    "Image 3 is the exact furniture reference to place instead of the selected object.",
    "Reproduce the furniture from image 3 faithfully: preserve its exact number of modules, silhouette, proportions, upholstery, seams, legs, colour, and distinctive details.",
    pointDescription,
    "Do not add a second item. The reference furniture must occupy the position of the selected existing object only, with believable scale, perspective, contact shadows, and lighting.",
    "Preserve all other furniture, décor, architecture, lighting, materials and composition as closely as possible.",
    "Keep the original image dimensions and camera framing exactly unchanged. No people, no text, no logos, no watermark.",
  ].join("\n") : "";
  const removalPrompt = body.removal?.name ? [
    "Use image 1 as the clean finished interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. Identify the complete semantic object containing the marker centre; the marker must not appear in the result.",
    `Remove that entire selected object: ${body.removal.name}.`,
    pointDescription,
    "Naturally reconstruct the background that was hidden behind the removed object. Do not add or replace it with another object.",
    "Preserve all other furniture, décor, walls, floor, lighting, materials, perspective and composition as closely as possible.",
    "Keep the original image dimensions and camera framing exactly unchanged.",
    "No people, no text, no logos, no watermark.",
  ].join("\n") : "";
  const dataUrlToBlob = (dataUrl: string) => {
    const [header, encoded] = dataUrl.split(",");
    const mediaType = header?.match(/^data:([^;]+);base64$/)?.[1];
    if (!mediaType || !encoded) throw new Error("Некорректный формат изображения.");
    return new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], { type: mediaType });
  };
  const validatedEditImage = async (source: string | undefined, label: string, mask = false) => {
    if (!source) throw new Error(`Загрузите ${label}.`);
    const blob = dataUrlToBlob(source);
    if (!(["image/png", "image/jpeg", "image/webp"].includes(blob.type)) || (mask && blob.type !== "image/png") || !blob.size || blob.size > 15 * 1024 * 1024) {
      throw new Error(`Некорректное изображение: ${label}.`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const png = bytes.length >= 26 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
    const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!(blob.type === "image/png" && png || blob.type === "image/jpeg" && jpeg || blob.type === "image/webp" && webp)) {
      throw new Error(`Некорректное изображение: ${label}.`);
    }
    if (mask && ![4, 6].includes(bytes[25])) throw new Error("Маска должна быть PNG с прозрачностью.");
    const dimensions = png ? { width: new DataView(bytes.buffer).getUint32(16), height: new DataView(bytes.buffer).getUint32(20) } : null;
    if (dimensions && (!dimensions.width || !dimensions.height)) throw new Error(`Некорректное изображение: ${label}.`);
    return dimensions;
  };
  const imageSourceToBlob = async (source: string, signal?: AbortSignal) => {
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
    const imageResponse = await fetch(imageUrl, { headers: { Accept: "image/*", "User-Agent": "ROOM-design-catalog/1.0" }, signal });
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

  const inferredOperation = body.planRender ? "plan_render" : body.upscale ? "upscale" : body.material ? "material" : body.globalEdit ? "global_edit" : body.removal ? "remove" : body.replacement ? "replace" : body.furnitureCasting || body.placement ? "place" : body.adjustment ? "adjust" : "generate";
  const requestedOperation = body.operation?.trim();
  const supportedOperations = new Set(["plan_render", "upscale", "material", "global_edit", "remove", "replace", "place", "adjust", "generate"]);
  if (requestedOperation && (!supportedOperations.has(requestedOperation) || requestedOperation !== inferredOperation)) {
    return Response.json({ error: "Тип AI-операции не соответствует переданным данным." }, { status: 400 });
  }
  const operation = requestedOperation || inferredOperation;
  if (operation === "material" && (body.placement || body.replacement || body.removal || body.adjustment || body.globalEdit || body.planRender || body.upscale || body.product)) {
    return Response.json({ error: "Material operation не может выполнять добавление, замену или удаление объекта." }, { status: 400 });
  }
  if (["global_edit", "material", "remove", "replace", "place"].includes(operation)) {
    try {
      await validatedEditImage(body.roomImage, "текущее изображение");
      if (operation === "global_edit" && !body.globalEdit?.instruction?.trim()) throw new Error("Опишите изменение изображения.");
      if (body.furnitureCasting) {
        if (operation !== "place" || furnitureCastingItems.length < 1 || furnitureCastingItems.length > 5) throw new Error("Добавьте от одного до пяти предметов мебели.");
        await validatedEditImage(body.furnitureCasting.markedImage, "изображение со всеми точками");
        for (const [index, item] of furnitureCastingItems.entries()) {
          if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || (item.x as number) < 0 || (item.x as number) > 100 || (item.y as number) < 0 || (item.y as number) > 100) throw new Error(`Укажите точку для предмета ${index + 1}.`);
          if (!item.referenceImage) throw new Error(`Загрузите референс предмета ${index + 1}.`);
          if (item.referenceImage.startsWith("data:")) await validatedEditImage(item.referenceImage, `референс предмета ${index + 1}`);
          else await imageSourceToBlob(item.referenceImage);
        }
      } else if (operation !== "global_edit") {
        if (!Number.isFinite(body.pointEdit?.x) || !Number.isFinite(body.pointEdit?.y) || (body.pointEdit?.x as number) < 0 || (body.pointEdit?.x as number) > 100 || (body.pointEdit?.y as number) < 0 || (body.pointEdit?.y as number) > 100) throw new Error("Поставьте точку на изображении.");
        await validatedEditImage(body.pointEdit?.markedImage, "изображение с маркером");
      }
      if (!body.furnitureCasting && (["material", "replace"].includes(operation) || operation === "place" && !body.product)) {
        if (!body.referenceImage) throw new Error(operation === "material" ? "Загрузите референс материала." : "Загрузите референс предмета.");
        if (body.referenceImage.startsWith("data:")) await validatedEditImage(body.referenceImage, operation === "material" ? "референс материала" : "референс предмета");
        else {
          const url = new URL(body.referenceImage);
          if (url.protocol !== "https:" || !/(^|\.)norrmobler\.ru$/i.test(url.hostname)) throw new Error("Источник референса материала не поддерживается.");
        }
      }
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Некорректные данные изображения." }, { status: 400 });
    }
  }
  const operationId = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
  const diagnosticBranch = body.roomImage && body.furnitureCasting?.markedImage && furnitureCastingItems.length ? "furniture_casting"
    : body.roomImage && body.referenceImage && body.material && body.pointEdit?.markedImage ? "material"
    : body.roomImage && body.globalEdit?.instruction ? "global_edit"
    : body.roomImage && body.referenceImage && body.replacement && body.pointEdit?.markedImage ? "replace"
    : body.roomImage && body.removal && body.pointEdit?.markedImage ? "remove"
    : body.roomImage && body.placement && body.pointEdit?.markedImage && (body.referenceImage || body.product) ? "add"
    : "other";
  const diagnosticMaskPresent = Boolean(body.adjustment?.mask);
  const diagnosticProviderInputImages = diagnosticBranch === "furniture_casting" ? 2 + furnitureCastingItems.length
    : diagnosticBranch === "material" || diagnosticBranch === "replace" || diagnosticBranch === "add" && Boolean(body.referenceImage) ? 3
    : diagnosticBranch === "remove" || diagnosticBranch === "add" || Boolean(body.roomImage) && Boolean(body.pointEdit?.markedImage) ? 2
    : diagnosticBranch === "global_edit" || Boolean(body.roomImage) ? 1
    : 0;
  const diagnosticProviderEndpoint = body.roomImage || body.planRender?.planImage ? "openai.images.edits" : "openai.images.generations";
  if (await database.prepare("SELECT id FROM generations WHERE id = ? AND user_id = ?").bind(operationId, user.id).first()) {
    return Response.json({ error: "Эта AI-операция уже выполнена." }, { status: 409 });
  }
  if (["material", "global_edit", "remove", "replace", "place"].includes(operation) && await database.prepare("SELECT id FROM token_transactions WHERE user_id = ? AND idempotency_key = ?").bind(user.id, `ai-refund:${operationId}`).first()) {
    return Response.json({ error: "Эта AI-операция уже завершилась ошибкой. Повторите попытку как новую операцию." }, { status: 409 });
  }
  let reservation: Awaited<ReturnType<typeof reserveAiTokens>>;
  try {
    reservation = await reserveAiTokens(user.id, operation, operationId, `ai-reserve:${user.id}:${operationId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Недостаточно токенов.";
    return Response.json({ error: message }, { status: message.includes("Недостаточно") ? 402 : 400 });
  }
  let refunded = false;
  const refundReservation = async (reason: string) => {
    if (reservation.transaction && !refunded) {
      await refundAiTokens(user.id, operationId, reservation.quote.tokenCost, reason);
      refunded = true;
    }
  };
  const providerTimeout = ["material", "global_edit", "remove", "replace", "place"].includes(operation) ? AbortSignal.timeout(180_000) : undefined;
  const providerTimedOut = (error?: unknown) => providerTimeout?.aborted || error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

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
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.furnitureCasting?.markedImage && furnitureCastingItems.length) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", furnitureCastingPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "clean-interior.png");
      form.append("image[]", dataUrlToBlob(body.furnitureCasting.markedImage), "numbered-placement-guide.png");
      const referenceBlobs = await Promise.all(furnitureCastingItems.map((item) => imageSourceToBlob(item.referenceImage as string, providerTimeout)));
      referenceBlobs.forEach((referenceBlob, index) => form.append("image[]", referenceBlob, `furniture-item-${index + 1}.${referenceBlob.type.split("/")[1] || "jpg"}`));
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.upscale) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", upscalePrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "source-image.png");
      form.append("size", outputSize);
      form.append("quality", "high");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.pointEdit?.markedImage && body.referenceImage && body.material) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", materialPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "clean-interior.png");
      form.append("image[]", dataUrlToBlob(body.pointEdit.markedImage), "marked-interior.png");
      const materialBlob = await imageSourceToBlob(body.referenceImage, providerTimeout);
      form.append("image[]", materialBlob, `material-reference.${materialBlob.type.split("/")[1] || "jpg"}`);
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.globalEdit?.instruction) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", globalEditPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "current-interior.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.pointEdit?.markedImage && body.referenceImage && body.replacement) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", replacementPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "clean-interior.png");
      form.append("image[]", dataUrlToBlob(body.pointEdit.markedImage), "marked-interior.png");
      const referenceBlob = await imageSourceToBlob(body.referenceImage, providerTimeout);
      form.append("image[]", referenceBlob, `furniture-reference.${referenceBlob.type.split("/")[1] || "jpg"}`);
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.pointEdit?.markedImage && body.removal) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", removalPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "clean-interior.png");
      form.append("image[]", dataUrlToBlob(body.pointEdit.markedImage), "marked-interior.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.adjustment?.mask) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", adjustmentPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "interior.webp");
      form.append("mask", dataUrlToBlob(body.adjustment.mask), "adjustment-area-mask.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.pointEdit?.markedImage && body.referenceImage && body.placement) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", editPrompt);
      form.append("image[]", body.roomImage === "sample-interior" ? await sampleInteriorBlob() : dataUrlToBlob(body.roomImage), "clean-interior.webp");
      form.append("image[]", dataUrlToBlob(body.pointEdit.markedImage), "marked-interior.png");
      const referenceBlob = await imageSourceToBlob(body.referenceImage, providerTimeout);
      form.append("image[]", referenceBlob, `furniture-reference.${referenceBlob.type.split("/")[1] || "jpg"}`);
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.pointEdit?.markedImage && body.product && body.placement) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", catalogPlacementPrompt);
      form.append("image[]", body.roomImage === "sample-interior" ? await sampleInteriorBlob() : dataUrlToBlob(body.roomImage), "clean-interior.webp");
      form.append("image[]", dataUrlToBlob(body.pointEdit.markedImage), "marked-interior.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size: outputSize, quality: "medium", output_format: "webp" }),
      });
    }
  } catch (error) {
    await refundReservation("Возврат после технической ошибки подготовки AI-операции");
    return Response.json({ error: providerTimedOut(error) ? "Сервис генерации не ответил вовремя. Попробуйте ещё раз." : error instanceof Error ? error.message : "Не удалось подготовить изображения." }, { status: providerTimedOut(error) ? 504 : 400 });
  }
  console.info("[generate-runtime-diagnostic]", JSON.stringify({
    requestId: operationId,
    operation,
    materialPresent: Boolean(body.material),
    referencePresent: Boolean(body.referenceImage || furnitureCastingItems.length),
    maskPresent: diagnosticMaskPresent,
    placementPresent: Boolean(body.placement || body.furnitureCasting),
    replacementPresent: Boolean(body.replacement),
    removalPresent: Boolean(body.removal),
    backendBranch: diagnosticBranch,
    providerInputImagesCount: diagnosticProviderInputImages,
    providerMask: diagnosticMaskPresent,
    providerEndpoint: diagnosticProviderEndpoint,
  }));
  let responseText: string;
  try {
    responseText = await response.text();
  } catch {
    await refundReservation("Возврат после ошибки чтения ответа AI-провайдера");
    return Response.json({ error: providerTimedOut() ? "Сервис генерации не ответил вовремя. Попробуйте ещё раз." : "Не удалось получить ответ сервиса генерации." }, { status: providerTimedOut() ? 504 : 502 });
  }
  let result: { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string }; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } } = {};
  try {
    result = JSON.parse(responseText);
  } catch {
    // A proxy or a transient gateway error can return HTML instead of JSON.
    // Keep the response actionable without exposing provider internals.
  }
  if (!response.ok) {
    await refundReservation("Возврат после ошибки AI-провайдера");
    console.error("Image edit failed", { status: response.status, operation, message: result.error?.message });
    return Response.json({ error: result.error?.message || `Сервис генерации временно недоступен (код ${response.status}). Попробуйте ещё раз.` }, { status: response.status });
  }

  const encodedImage = result.data?.[0]?.b64_json;
  if (!encodedImage) {
    await refundReservation("Возврат: AI-провайдер не вернул изображение");
    return Response.json({ error: "Изображение не вернулось от модели." }, { status: 502 });
  }

  let binary: Uint8Array<ArrayBuffer>;
  try {
    binary = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
    if (!binary.byteLength) throw new Error("Пустое изображение.");
  } catch {
    await refundReservation("Возврат после некорректного изображения AI-провайдера");
    return Response.json({ error: "Сервис генерации вернул некорректное изображение." }, { status: 502 });
  }
  const outputKey = `${tenantStoragePrefix(user)}/generations/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.webp`;
  try {
    await storage().put(outputKey, binary, { httpMetadata: { contentType: "image/webp" } });
    const tokenTransaction = reservation.transaction as { id?: string } | null;
    await recordGeneration(user, { id: operationId, operation, prompt: body.prompt || "", outputKey, contentType: "image/webp", bytes: binary.byteLength, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens, totalTokens: result.usage?.total_tokens, tokenTransactionId: tokenTransaction?.id || null, tokenCost: reservation.quote.tokenCost, bruttoCoefficientSnapshot: reservation.quote.bruttoCoefficient });
  } catch (error) {
    await refundReservation("Возврат после ошибки сохранения результата AI-операции");
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить результат генерации." }, { status: 503 });
  }
  const usageHeaders: Record<string, string> = {
    "Content-Type": "image/webp",
    "Cache-Control": "no-store",
    "X-Room-AI-Model": model,
    "X-Room-AI-Operation": operation,
    "X-Room-AI-Token-Cost": String(reservation.quote.tokenCost),
    "X-Room-AI-Charging": reservation.quote.chargingEnabled ? "enabled" : "estimate-only",
  };
  if (result.usage?.input_tokens !== undefined) usageHeaders["X-Room-AI-Input-Tokens"] = String(result.usage.input_tokens);
  if (result.usage?.output_tokens !== undefined) usageHeaders["X-Room-AI-Output-Tokens"] = String(result.usage.output_tokens);
  if (result.usage?.total_tokens !== undefined) usageHeaders["X-Room-AI-Total-Tokens"] = String(result.usage.total_tokens);
  return new Response(binary, { headers: usageHeaders });
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
