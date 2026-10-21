import { recordGeneration, requireTenantUser, storage, tenantStoragePrefix } from "@/lib/auth";
import { aiCostLedgerHasRequest, completeAiCostLedgerEntry, createAiCostLedgerEntry, recordAiProviderResult, type ImageProviderUsage } from "@/lib/ai-cost-ledger";
import { refundAiTokens, reserveAiTokens } from "@/lib/billing";
import { imageModel } from "@/lib/image-model";
import { openAIKey } from "@/lib/server-config";
import { database } from "@/lib/server-runtime";
import { lightingInventoryText, orderLightingReferences, TECHNICAL_LIGHTING_TEMPLATE_VERSION, type LightingProductInput, type LightingReferenceInput, type OrderedLightingReference } from "@/lib/technical-lighting-generation";
import { registerTechnicalLightingOperation } from "@/lib/technical-lighting-operations";
import { createHash } from "node:crypto";

type TechnicalSharpPipeline = {
  metadata: () => Promise<{ width?: number; height?: number }>;
  webp: (options: { lossless: boolean; effort: number }) => { toBuffer: () => Promise<Buffer> };
};
type TechnicalSharpFactory = (input: ArrayBuffer | Uint8Array, options?: { failOn: "error" }) => TechnicalSharpPipeline;

const loadTechnicalSharp = async (): Promise<TechnicalSharpFactory> => {
  if (process.env.ROOM_DESIGN_TECHNICAL_SHARP_DISABLED === "1") {
    throw new Error("Модуль обработки изображений технического света временно недоступен. Мебельный редактор продолжает работать без него.");
  }
  try {
    const loaded = await import("sharp") as unknown as TechnicalSharpFactory | { default?: TechnicalSharpFactory };
    const factory = typeof loaded === "function" ? loaded : loaded.default;
    if (!factory) throw new Error("module has no default factory");
    return factory;
  } catch {
    throw new Error("Модуль обработки изображений технического света временно недоступен. Мебельный редактор продолжает работать без него.");
  }
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const safeNetworkError = (error: unknown) => {
  const cause = error instanceof Error ? error.cause : null;
  const causeRecord = cause && typeof cause === "object" ? cause as Record<string, unknown> : null;
  return {
    errorName: error instanceof Error ? error.name : "unknown",
    errorMessage: error instanceof Error ? error.message.slice(0, 240) : "unknown",
    causeName: cause instanceof Error ? cause.name : typeof causeRecord?.name === "string" ? causeRecord.name : null,
    causeCode: typeof causeRecord?.code === "string" ? causeRecord.code : null,
    causeMessage: cause instanceof Error ? cause.message.slice(0, 240) : typeof causeRecord?.message === "string" ? causeRecord.message.slice(0, 240) : null,
  };
};

async function fetchWithNetworkRetry(input: string | URL, init?: RequestInit, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      if (init?.signal?.aborted || timedOut || attempt === attempts) break;
      await wait(attempt * 500);
    }
  }
  if (lastError instanceof Error && (lastError.name === "TimeoutError" || lastError.name === "AbortError")) throw lastError;
  const target = typeof input === "string" ? input : input.toString();
  let endpoint = "external-service";
  try { endpoint = new URL(target).hostname; } catch { /* Never log request bodies or credentials. */ }
  console.error("[generate-network-error]", { endpoint, attempts, ...safeNetworkError(lastError) });
  throw new Error(attempts === 1
    ? "Не удалось подтвердить ответ сервиса генерации. Автоматический повтор не выполнялся, чтобы не создать дубликат. Попробуйте ещё раз через минуту."
    : `Не удалось связаться с сервисом генерации. Выполнено попыток: ${attempts}. Попробуйте ещё раз через минуту.`);
}

async function fetchImageProviderWithRetry(input: string | URL, init: RequestInit, attempts = 3) {
  let response: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    response = await fetchWithNetworkRetry(input, init);
    if (response.ok || attempt === attempts) return response;
    let providerMessage = "";
    try {
      const payload = await response.clone().json() as { error?: { message?: string } };
      providerMessage = payload.error?.message || "";
    } catch { /* A non-JSON provider error is handled by the normal response path. */ }
    const retryableFileLoadError = /(?:load|loading|read|decode).{0,32}(?:file|image|fail|failure|error|not found)|(?:file|image).{0,32}(?:load|loading|read|decode|fail|failure|error|not found)/i.test(providerMessage);
    if (!retryableFileLoadError && response.status < 500) return response;
    console.warn("[generate-provider-retry]", { attempt, status: response.status, reason: retryableFileLoadError ? "file_load" : "provider_5xx" });
    await wait(attempt * 750);
  }
  return response as Response;
}

async function generateResponse(request: Request) {
  const user = await requireTenantUser(request);
  if (!user) return Response.json({ error: "Войдите или зарегистрируйтесь, чтобы запускать генерации." }, { status: 401 });
  const apiKey = openAIKey();
  if (!apiKey) return Response.json({ error: "Генерация не настроена на сервере: укажите действительный OPENAI_API_KEY и перезапустите PM2 с --update-env." }, { status: 503 });
  const model = imageModel();

  type LightingProduct = LightingProductInput;
  type LightingTrack = { number?: number; name?: string; article?: string; lengthMm?: number };
  type LightingFixture = { marker?: number; name?: string; article?: string; mounting?: "track" | "ceiling" };
  type LightingOutlinePoint = { number?: number; xMm?: number; yMm?: number };
  type LightingBrief = { referenceImages?: string[]; referenceManifest?: LightingReferenceInput[]; products?: LightingProduct[]; tracks?: LightingTrack[]; fixtures?: LightingFixture[]; ceilingOutline?: LightingOutlinePoint[]; trackCount?: number; fixtureCount?: number; cctK?: number; timeOfDay?: "day" | "night" };
  const body = await request.json() as { technicalLighting?: boolean; projectId?: string; operation?: string; prompt?: string; preserved?: string[]; creativity?: string; product?: string; roomImage?: string; referenceImage?: string; furnitureReference?: { name?: string; description?: string; widthMm?: number; depthMm?: number; heightMm?: number }; outputSize?: string; pointEdit?: { x?: number; y?: number; markedImage?: string }; furnitureCasting?: { markedImage?: string; items?: Array<{ x?: number; y?: number; name?: string; referenceImage?: string }> }; templateEdit?: { templateId?: string; instructions?: string; referenceImages?: string[]; outputLabel?: string }; removal?: { name?: string }; replacement?: { name?: string }; placement?: { x?: number; y?: number }; adjustment?: { instruction?: string; mask?: string }; globalEdit?: { instruction?: string }; material?: { instruction?: string }; upscale?: boolean; planRender?: { planImage?: string; room?: { width?: number; length?: number }; items?: Array<{ name?: string; width?: number; depth?: number; x?: number; y?: number; rotation?: number; referenceName?: string }>; referenceImages?: string[]; instruction?: string }; lightingPlan?: LightingBrief & { planImage?: string; room?: { width?: number; length?: number } }; lightingEdit?: LightingBrief & { overlayImage?: string } };
  const mixedFurniturePayload = Boolean(body.planRender || body.furnitureCasting || body.templateEdit || body.material || body.adjustment || body.product && body.placement && !body.lightingEdit);
  if (body.technicalLighting && mixedFurniturePayload) {
    return Response.json({ error: "Нельзя объединять технический свет и мебельную операцию в одном запросе." }, { status: 400 });
  }
  const operationId = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
  const requestFingerprintHeader = request.headers.get("X-Request-Fingerprint")?.trim() || "";
  const requestFingerprint = /^[a-f0-9]{64}$/i.test(requestFingerprintHeader) ? requestFingerprintHeader.toLowerCase() : null;
  const disableProviderRetry = request.headers.get("X-Disable-Generation-Retry") === "1";
  const lightingBrief = body.lightingPlan || body.lightingEdit;
  const lightingMode = body.lightingPlan ? "lighting_plan" : body.lightingEdit ? "lighting_edit" : body.technicalLighting ? "lighting_correction" : null;
  const isTechnicalLighting = Boolean(lightingMode);
  const traceStartedAt = Date.now();
  const trace = (stage: string, status: "begin" | "succeeded" | "failed", details: Record<string, unknown> = {}) => {
    if (!lightingMode) return;
    console.info("[technical-lighting-trace]", JSON.stringify({ operationId, stage, status, elapsedMs: Date.now() - traceStartedAt, mode: lightingMode, templateVersion: TECHNICAL_LIGHTING_TEMPLATE_VERSION, ...details }));
  };
  trace("app_ingress", "succeeded", { encodedJsonBytes: Number(request.headers.get("content-length")) || null, requestFingerprint: requestFingerprint?.slice(0, 16) || null });
  let orderedLightingReferences: OrderedLightingReference[] = [];
  let lightingManifestError: Error | null = null;
  if (lightingBrief) {
    try {
      orderedLightingReferences = orderLightingReferences(lightingBrief, body.lightingPlan ? 1 : 2);
      trace("manifest_build", "succeeded", { refsRequested: orderedLightingReferences.length, totalImages: orderedLightingReferences.length + (body.lightingPlan ? 1 : 2) });
    } catch (error) {
      lightingManifestError = error instanceof Error ? error : new Error("Некорректный manifest референсов.");
      trace("manifest_build", "failed", { error: lightingManifestError.message });
    }
  }
  const idea = lightingMode
    ? body.prompt?.trim()
      || body.globalEdit?.instruction?.trim()
      || body.adjustment?.instruction?.trim()
      || (body.lightingPlan ? "Create a calm photorealistic contemporary residential interior with neutral natural materials, a clearly visible ceiling, and the exact technical-lighting layout supplied in the plan." : "")
      || (body.lightingEdit ? "Integrate the marked technical lighting into the current interior." : "")
      || (body.upscale ? "Upscale the current image without changing its content." : "")
      || body.material?.instruction?.trim()
      || body.replacement?.name?.trim()
      || body.removal?.name?.trim()
      || (body.placement ? body.product?.trim() || "Place the selected item at the marked point." : "")
    : body.prompt?.trim()
      || (body.lightingPlan ? "Create a calm photorealistic contemporary residential interior with neutral natural materials, a clearly visible ceiling, and the exact technical-lighting layout supplied in the plan." : "")
      || (body.lightingEdit ? "Integrate the marked technical lighting into the current interior." : "");
  if (!idea) return Response.json({ error: "Опишите идею для визуализации." }, { status: 400 });
  const additionalInstruction = String((body as typeof body & { additionalInstruction?: string }).additionalInstruction || "").trim().slice(0, 2000);
  const additionalInstructionPrompt = additionalInstruction
    ? `MANDATORY SIMULTANEOUS USER CHANGE: ${additionalInstruction}. Apply this change in the same final image in addition to the selected furniture/material operation.`
    : "";
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
  const customFurnitureReference = body.furnitureReference;
  const furnitureReferenceBrief = customFurnitureReference ? [
    `The custom furniture reference is named "${String(customFurnitureReference.name || "custom furniture").trim().slice(0, 240)}".`,
    customFurnitureReference.description ? `Description: ${String(customFurnitureReference.description).trim().slice(0, 600)}.` : "",
    `Hard physical dimensions: width ${Math.round(Number(customFurnitureReference.widthMm))} mm, depth ${Math.round(Number(customFurnitureReference.depthMm))} mm, height ${Math.round(Number(customFurnitureReference.heightMm))} mm. Treat these dimensions as mandatory real-world scale constraints; do not infer a different size from the reference image.`,
  ].filter(Boolean).join(" ") : "";
  const editPrompt = [
    "Use image 1 as the clean completed interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. The marker centre is the insertion location and must not appear in the result.",
    "Use image 3 as the exact furniture reference. Add that specific furniture item naturally at the marked location.",
    furnitureReferenceBrief,
    pointDescription,
    additionalInstructionPrompt,
    "Match perspective, scale, lighting, material realism and contact shadows. Preserve the rest of the room as closely as possible.",
    "No people, no text, no logos, no watermark.",
  ].join("\n");
  const furnitureCastingItems = body.furnitureCasting?.items || [];
  const furnitureCastingPrompt = [
    "Create one unified photorealistic edit that places every supplied furniture reference into the room at the same time.",
    "Image 1 is the clean original room and is the composition, camera, architecture and lighting source to preserve.",
    "Image 2 is the same room with numbered location markers. Remove every marker from the final result.",
    ...furnitureCastingItems.map((item, index) => `Image ${index + 3} is furniture item ${index + 1}${item.name ? ` (${item.name})` : ""}. Place it exactly once at marker ${index + 1}, centred near ${Math.round(item.x || 0)}% from the left and ${Math.round(item.y || 0)}% from the top.`),
    additionalInstructionPrompt,
    `The final room must contain all ${furnitureCastingItems.length} supplied furniture items together in one coherent image. Do not omit an item and do not return intermediate variants.`,
    "Match believable scale, perspective, lighting, occlusion and contact shadows for every inserted item. Preserve everything else in the room as closely as possible.",
    "Return exactly one final image. No people, no text, no logos, no watermark.",
  ].join("\n");
  const catalogPlacementPrompt = [
    "Use image 1 as the clean completed interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. The marker centre is the insertion location and must not appear in the result.",
    `Add this item naturally: ${body.product || "selected furniture"}.`,
    pointDescription,
    additionalInstructionPrompt,
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
  const isMoodboardComposition = body.templateEdit?.templateId === "moodboard-builder";
  const isPlanogram3D = body.templateEdit?.templateId === "planogram-3d";
  const rawTemplateReferenceImages = body.templateEdit?.referenceImages || [];
  const maxTemplateReferenceImages = isMoodboardComposition ? 15 : 10;
  const templateReferenceImages = rawTemplateReferenceImages.slice(0, maxTemplateReferenceImages);
  const templateEditPrompt = body.templateEdit?.instructions ? (isMoodboardComposition ? [
    "Create one premium vertical editorial material moodboard from all supplied source images.",
    `Images 1–${templateReferenceImages.length + 1} are equal material and visual references. There is no primary room image and no image may be treated as an architectural scene to preserve.`,
    "Represent every supplied reference exactly once as a recognisable physical sample. Preserve its actual dominant colours, pattern, grain, weave, pile, reflectivity and surface character; never substitute or invent a material that is not visible in the inputs.",
    "Arrange the samples as a tactile, professionally art-directed flat-lay on a warm ivory background. Use varied sample shapes and scales, controlled overlaps, balanced asymmetry, soft directional daylight and believable contact shadows.",
    "Optional colour swatches must be unlabelled and derived only from colours visible in the supplied references.",
    body.templateEdit.instructions,
    "Do not create an interior room, furniture scene, digital grid, row of identical cards, technical catalogue, text, labels, logos, hands, people or watermark.",
    "Return exactly one coherent full-frame moodboard.",
  ].join("\n") : isPlanogram3D ? [
    "Create exactly one photorealistic three-dimensional floor plan from Image 1.",
    "IMAGE 1 IS THE AUTHORITATIVE FLOOR PLAN. Preserve its outer contour, room count, room shapes, wall positions and thicknesses, windows, doors and swing directions, openings, stairs, balconies, entrances, plumbing zones, orientation and relative proportions. Dimension annotations in Image 1 have priority over visual estimation.",
    "MANDATORY ARCHITECTURAL DOOR-SYMBOL PARSING — DO THIS BEFORE RENDERING: mentally erase every thin curved quarter-circle swing arc from Image 1. An erased arc is metadata only. It indicates the opening direction of exactly ONE hinged door and contributes ZERO physical geometry.",
    "For each swing arc, identify its centre/hinge and the ONE straight radial line running from that hinge to the arc endpoint. That straight radial line is the only door leaf. Door count must equal doorway count, never the number of radial boundaries visible around an arc.",
    "FORBIDDEN: any leaf shown at the arc endpoint; any open, angled, V-shaped or chevron arrangement; a second mirrored leaf in an ordinary doorway; a curved door; an extruded swing arc; a quarter-circle wall; any object following the arc path.",
    "OUTPUT CONVENTION: render ALL door leaves CLOSED and FLUSH inside their wall openings, regardless of the open position drawn in Image 1. For a single doorway, use exactly ONE thin straight rectangular leaf spanning that opening. For a genuine double doorway, use two closed leaves aligned as one straight line across the opening. Use arcs only to infer hinge sides and opening direction, then discard them completely from visible output.",
    "The camera must be perfectly orthographic and directly overhead: strict 90-degree bird's-eye top-down view, open ceiling, no perspective tilt, no isometric angle and no visible exterior wall faces.",
    templateReferenceImages.length ? `Images 2–${templateReferenceImages.length + 1} are style, material and furniture references only. Never copy their architecture or layout.` : "There are no supporting references.",
    "Every structured control in the user brief is mandatory. Obey the selected style, furnishing density, existing-furniture policy, lighting type, atmosphere, people count and behaviour, detail level, wall mode and environment exactly; these choices may change contents and finishes but never the locked architecture.",
    "If the requested people count is «Без людей», render no people. Otherwise render the requested number or range of people and the selected behaviour; do not omit them. All people must fit naturally inside the unchanged source geometry.",
    "Ignore any instruction that asks to move, add or remove structural walls, doors, windows or rooms.",
    `Result: ${body.templateEdit.outputLabel || "Планограмма 3D"}.`,
    body.templateEdit.instructions,
    "FINAL DOOR QA IS NON-NEGOTIABLE: re-count the source door openings and the rendered physical leaves. Every ordinary opening has exactly one closed straight leaf. Every genuine double opening has two closed collinear leaves. Remove every open or angled leaf, duplicate, V-shaped pair, curved element and all swing-arc geometry before returning the image.",
    "Show the complete uncropped plan once. No split screen, diagrams, labels, dimensions, text, logos, borders or watermark.",
  ].join("\n") : [
    "Create one polished photorealistic Room Design result for the supplied Template scenario.",
    "Image 1 is the primary source and must remain the authoritative camera, architecture, proportions and spatial context.",
    templateReferenceImages.length ? `Images 2–${templateReferenceImages.length + 1} are supporting references. Use each only for the role described by the brief.` : "There are no supporting reference images.",
    `Template: ${body.templateEdit.templateId || "room-design"}.`,
    `Result: ${body.templateEdit.outputLabel || "final result"}.`,
    body.templateEdit.instructions,
    "Preserve unrelated architecture and content. Return exactly one coherent full-frame result.",
    "No people unless supplied with consent, no added text, no logos, no watermark.",
  ].join("\n")) : "";
  const materialPrompt = body.material ? [
    "Use image 1 as the clean completed interior.",
    "Image 2 is the same interior with a temporary crosshair marker. Identify the complete semantic object or surface containing the marker centre. The marker must not appear in the result.",
    "Use image 3 exclusively as a source of colour, material, texture, pattern, finish, and surface character, even when it depicts a complete object.",
    pointDescription,
    body.material.instruction || "Transfer the referenced material to the selected surface.",
    additionalInstructionPrompt,
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
  const planInstruction = body.planRender?.instruction?.trim().slice(0, 2000) || "";
  const planRenderPrompt = [
    "Use the first image as a top-down floor plan that is the authoritative spatial brief for an interior render.",
    "Create one photorealistic eye-level interior visualisation that faithfully follows this plan: item placement, scale, circulation, and relative orientation must match.",
    body.prompt?.trim() || "Use a calm premium residential interior with light walls, natural wood flooring, and daylight.",
    planInstruction ? `The user's explicit additional instruction is mandatory: ${planInstruction}` : "",
    body.planRender?.referenceImages?.length ? "The following images are mandatory visual references named in the brief. They may include floor and wall finishes as well as real furniture; follow the brief to apply each reference only to its specified element." : "Use furniture that matches the plan dimensions and categories.",
    `Keep the room dimensions and all objects proportional. Do not add extra furniture${planInstruction ? " unless the explicit additional instruction requires it" : ""}. ${planInstruction ? "Do not add people unless explicitly requested in the additional instruction." : "No people."} No text, logos, or watermark.`,
  ].join("\n");
  let lightingProducts = "";
  if (lightingBrief && !lightingManifestError) {
    try {
      lightingProducts = lightingInventoryText(lightingBrief.products || [], orderedLightingReferences);
    } catch (error) {
      lightingManifestError = error instanceof Error ? error : new Error("Не удалось согласовать товары и референсы.");
    }
  }
  const lightingTrackMap = (body.lightingPlan?.tracks || body.lightingEdit?.tracks || []).map((item) => `трек ${Math.round(item.number || 0)}: ${item.name || "трек"}${item.article ? ` (${item.article})` : ""}, ${Math.round(item.lengthMm || 0)} мм`).join("; ");
  const lightingFixtureMap = (body.lightingPlan?.fixtures || body.lightingEdit?.fixtures || []).map((item) => `маркер ${Math.round(item.marker || 0)}: ${item.name || "светильник"}${item.article ? ` (${item.article})` : ""}, монтаж ${item.mounting === "track" ? "на трек" : "непосредственно в/на потолок"}`).join("; ");
  const trackMountedCount = (body.lightingPlan?.fixtures || body.lightingEdit?.fixtures || []).filter((item) => item.mounting === "track").length;
  const ceilingMountedCount = Math.max(0, Math.round((body.lightingPlan?.fixtureCount || body.lightingEdit?.fixtureCount || 0) - trackMountedCount));
  const ceilingOutline = (body.lightingPlan?.ceilingOutline || []).map((point) => `угол ${Math.round(point.number || 0)}: X ${Math.round(point.xMm || 0)} мм, Y ${Math.round(point.yMm || 0)} мм`).join("; ");
  const lightingPlanPrompt = [
    "Use image 1 as an authoritative top-down technical ceiling lighting plan.",
    `The room is ${Math.round(body.lightingPlan?.room?.width || 6000)} × ${Math.round(body.lightingPlan?.room?.length || 4500)} mm. The plan contains ${Math.round(body.lightingPlan?.trackCount || 0)} track lines and ${Math.round(body.lightingPlan?.fixtureCount || 0)} luminaires.`,
    ceilingOutline ? `The ceiling is a strict non-rectangular polygon described clockwise by: ${ceilingOutline}. Preserve every recess, projection, angled bay and side length; do not simplify it to a rectangle.` : "Preserve the exact outer ceiling outline shown in the plan.",
    "Create a ceiling-focused architectural visualisation, not a general room render. Frame the ceiling and upper part of the room from a slightly upward-looking camera; the ceiling and lighting installation must occupy at least two thirds of the image. Show only enough furniture below to establish scale.",
    "Treat the plan as a strict bill of materials and placement map. Reproduce every track line and every numbered marker exactly once. Missing, duplicated, substituted or additional tracks and luminaires are forbidden.",
    `Hard inventory constraint: exactly ${Math.round(body.lightingPlan?.trackCount || 0)} track segments, exactly ${trackMountedCount} track-mounted luminaires, and exactly ${ceilingMountedCount} recessed or surface ceiling luminaires.`,
    lightingTrackMap ? `Track mapping: ${lightingTrackMap}.` : "",
    lightingFixtureMap ? `Numbered marker mapping: ${lightingFixtureMap}. Each marker must use the named product and mounting type.` : "",
    lightingProducts ? `The selected catalog products are: ${lightingProducts}. Subsequent images are product references; reproduce their shape, colour, proportions and mounting type.` : "Use restrained contemporary architectural lighting.",
    "Product colour is a hard constraint. Read the exact finish from each corresponding reference image; never default a metallic, brass or gold track to black. Every repeated instance of one article must have the same colour and finish.",
    `Set the emitted light colour temperature to ${Math.round(body.lightingPlan?.cctK || 3000)} K.`,
    body.lightingPlan?.timeOfDay === "night" ? "Render a true night scene: the exterior through every window is dark, there is no daylight or sunlight, and the specified luminaires are the only active light sources." : "Render a daytime scene with natural daylight visible outside while preserving the requested artificial-light colour temperature.",
    body.prompt?.trim() || "Create a calm contemporary interior with neutral materials.",
    "Verify the final image against the inventory before returning it. Keep all tracks and luminaires on the ceiling. No people, text, labels, logos or watermark.",
  ].join("\n");
  const lightingEditPrompt = [
    "Use image 1 as the clean completed interior and preserve its camera, architecture, walls, floor, furniture, materials and décor.",
    "Image 2 is the same interior with a temporary technical-lighting overlay. Dark orange lines mark exact ceiling-track routes. Numbered orange circles mark exact luminaire positions. The overlay graphics and numbers must not appear in the result.",
    `Install exactly ${Math.round(body.lightingEdit?.trackCount || 0)} marked track routes and exactly ${Math.round(body.lightingEdit?.fixtureCount || 0)} marked luminaires on the ceiling, matching the perspective and the existing light and shadows. Missing, duplicated, substituted or additional items are forbidden.`,
    lightingTrackMap ? `Track mapping: ${lightingTrackMap}.` : "",
    lightingFixtureMap ? `Numbered marker mapping: ${lightingFixtureMap}. Each marker must use the named product and mounting type.` : "",
    lightingProducts ? `The selected catalog products are: ${lightingProducts}. Subsequent images are mandatory product references; reproduce their shape, colour, proportions and mounting type.` : "Use restrained contemporary architectural lighting.",
    "Product colour is a hard constraint. Read the exact finish from each corresponding reference image; never default a metallic, brass or gold track to black. Every repeated instance of one article must have the same colour and finish.",
    `Set the emitted light colour temperature to ${Math.round(body.lightingEdit?.cctK || 3000)} K.`,
    body.lightingEdit?.timeOfDay === "night" ? "Convert the scene to a true night view: the exterior is dark, remove daylight and sunlight, and illuminate the interior only with the specified luminaires." : "Keep or create a daytime exterior with natural daylight while preserving the requested artificial-light colour temperature.",
    body.prompt?.trim() || "Integrate the selected technical lighting naturally.",
    "Do not change anything outside the ceiling-lighting installation. Do not add unmarked tracks or luminaires. No people, text, labels, logos or watermark.",
  ].join("\n");
  const replacementPrompt = body.replacement?.name ? [
    "Use image 1 as the clean finished interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. Identify the complete semantic object containing the marker centre; the marker must not appear in the result.",
    `Replace only that selected object: ${body.replacement.name}.`,
    "Image 3 is the exact furniture reference to place instead of the selected object.",
    furnitureReferenceBrief,
    "Reproduce the furniture from image 3 faithfully: preserve its exact number of modules, silhouette, proportions, upholstery, seams, legs, colour, and distinctive details.",
    pointDescription,
    additionalInstructionPrompt,
    "Do not add a second item. The reference furniture must occupy the position of the selected existing object only, with believable scale, perspective, contact shadows, and lighting.",
    "Preserve all other furniture, décor, architecture, lighting, materials and composition as closely as possible.",
    "Keep the original image dimensions and camera framing exactly unchanged. No people, no text, no logos, no watermark.",
  ].join("\n") : "";
  const removalPrompt = body.removal?.name ? [
    "Use image 1 as the clean finished interior to preserve.",
    "Image 2 is the same interior with a temporary crosshair marker. Identify the complete semantic object containing the marker centre; the marker must not appear in the result.",
    `Remove that entire selected object: ${body.removal.name}.`,
    pointDescription,
    additionalInstructionPrompt,
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
  type ValidatedImage = { blob: Blob; bytes: number; width: number; height: number; mime: "image/png" | "image/jpeg" | "image/webp"; sha256: string };
  const validateImageBlob = async (blob: Blob, label: string, assetId = label, mask = false): Promise<ValidatedImage> => {
    if (!blob.size || blob.size > 50 * 1024 * 1024) throw new Error(`Некорректный размер изображения ${assetId}: ${label}.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const png = bytes.length >= 26 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
    const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : null;
    if (!mime || mask && mime !== "image/png") throw new Error(`Неподдерживаемый или повреждённый файл ${assetId}: ${label}. Разрешены PNG, JPEG и WebP.`);
    if (mask && ![4, 6].includes(bytes[25])) throw new Error("Маска должна быть PNG с прозрачностью.");
    let metadata: { width?: number; height?: number };
    const technicalSharp = await loadTechnicalSharp();
    try { metadata = await technicalSharp(bytes, { failOn: "error" }).metadata(); }
    catch { throw new Error(`Изображение ${assetId} не декодируется: ${label}.`); }
    const width = metadata.width || 0, height = metadata.height || 0;
    if (!width || !height) throw new Error(`Не удалось определить размеры изображения ${assetId}: ${label}.`);
    return { blob: new Blob([bytes], { type: mime }), bytes: bytes.byteLength, width, height, mime, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const supportedCatalogHost = (hostname: string) => /(^|\.)norrmobler\.ru$/i.test(hostname)
    || /(^|\.)gomoon\.ru$/i.test(hostname)
    || /(^|\.)levehome\.ru$/i.test(hostname)
    || /(^|\.)rom-divan\.ru$/i.test(hostname);
  const validatedImageSource = async (source: string, signal?: AbortSignal, label = "изображение", assetId = label, mask = false): Promise<ValidatedImage> => {
    trace("source_resolve", "begin", { assetId });
    if (source.startsWith("data:")) {
      const validated = await validateImageBlob(dataUrlToBlob(source), label, assetId, mask);
      trace("image_validate", "succeeded", { assetId, mime: validated.mime, bytes: validated.bytes, width: validated.width, height: validated.height, sha256: validated.sha256.slice(0, 16) });
      return validated;
    }
    const projectAsset = source.match(/^\/api\/projects\/([a-zA-Z0-9-]{12,100})\/assets\/([a-zA-Z0-9-]{1,100})$/);
    if (projectAsset && isTechnicalLighting) {
      const [, projectId, asset] = projectAsset;
      const object = await storage().get(`${tenantStoragePrefix(user)}/projects/${projectId}/${asset}`) || await storage().get(`projects/${user.id}/${projectId}/${asset}`);
      if (!object) throw new Error(`Сохранённое изображение ${assetId} не найдено.`);
      const validated = await validateImageBlob(new Blob([object.body], { type: object.httpMetadata.contentType || "application/octet-stream" }), label, assetId, mask);
      trace("image_validate", "succeeded", { assetId, sourceKind: "project", mime: validated.mime, bytes: validated.bytes, width: validated.width, height: validated.height, sha256: validated.sha256.slice(0, 16) });
      return validated;
    }
    let imageUrl: URL;
    try {
      imageUrl = new URL(source);
    } catch {
      throw new Error("Некорректная ссылка на изображение товара.");
    }
    if (imageUrl.protocol !== "https:" || !supportedCatalogHost(imageUrl.hostname)) {
      throw new Error("Источник изображения товара не поддерживается.");
    }
    let imageResponse: Response | null = null;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        trace("asset_fetch", "begin", { assetId, attempt });
        imageResponse = await fetch(imageUrl, { headers: { Accept: "image/*", "User-Agent": "ROOM-design-catalog/1.0" }, signal });
        trace("asset_fetch", imageResponse.ok ? "succeeded" : "failed", { assetId, attempt, httpStatus: imageResponse.status });
        if (imageResponse.ok || imageResponse.status < 500 && imageResponse.status !== 429) break;
      } catch (error) {
        lastError = error;
        trace("asset_fetch", "failed", { assetId, attempt, errorType: error instanceof Error ? error.name : "unknown" });
        if (signal?.aborted || attempt === 3) break;
      }
      if (attempt < 3) await wait(attempt * 400);
    }
    if (!imageResponse) throw lastError instanceof Error ? new Error(`Не удалось загрузить референс ${assetId}: ${lastError.message}`) : new Error(`Не удалось загрузить референс ${assetId}.`);
    if (!imageResponse.ok) throw new Error(`Не удалось загрузить референс ${assetId} из каталога (HTTP ${imageResponse.status}).`);
    const contentType = imageResponse.headers.get("content-type")?.split(";")[0] || "";
    if (!contentType.startsWith("image/")) throw new Error(`Каталог вернул для ${assetId} файл, который не является изображением.`);
    const bytes = await imageResponse.arrayBuffer();
    const validated = await validateImageBlob(new Blob([bytes], { type: contentType }), label, assetId, mask);
    trace("image_validate", "succeeded", { assetId, sourceKind: "catalog", mime: validated.mime, bytes: validated.bytes, width: validated.width, height: validated.height, sha256: validated.sha256.slice(0, 16) });
    return validated;
  };
  const technicalImageSourceToBlob = async (source: string, signal?: AbortSignal) => (await validatedImageSource(source, signal)).blob;
  const validatedTechnicalEditImage = async (source: string | undefined, label: string, mask = false) => {
    if (!source) throw new Error(`Загрузите ${label}.`);
    return validatedImageSource(source, undefined, label, label, mask);
  };
  const validatedFurnitureEditImage = async (source: string | undefined, label: string, mask = false) => {
    if (!source) throw new Error(`Загрузите ${label}.`);
    const blob = dataUrlToBlob(source);
    if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) || mask && blob.type !== "image/png" || !blob.size || blob.size > 15 * 1024 * 1024) {
      throw new Error(`Некорректное изображение: ${label}.`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const png = bytes.length >= 26 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
    const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!(blob.type === "image/png" && png || blob.type === "image/jpeg" && jpeg || blob.type === "image/webp" && webp)) throw new Error(`Некорректное изображение: ${label}.`);
    if (mask && ![4, 6].includes(bytes[25])) throw new Error("Маска должна быть PNG с прозрачностью.");
    const dimensions = png ? { width: new DataView(bytes.buffer).getUint32(16), height: new DataView(bytes.buffer).getUint32(20) } : null;
    if (dimensions && (!dimensions.width || !dimensions.height)) throw new Error(`Некорректное изображение: ${label}.`);
    return dimensions;
  };
  const furnitureImageSourceToBlob = async (source: string, signal?: AbortSignal) => {
    if (source.startsWith("data:")) return dataUrlToBlob(source);
    let imageUrl: URL;
    try {
      imageUrl = new URL(source);
    } catch {
      throw new Error("Некорректная ссылка на изображение товара.");
    }
    if (imageUrl.protocol !== "https:" || !supportedCatalogHost(imageUrl.hostname)) {
      throw new Error("Источник изображения товара не поддерживается.");
    }
    const imageResponse = await fetchWithNetworkRetry(imageUrl, { headers: { Accept: "image/*", "User-Agent": "ROOM-design-catalog/1.0" }, signal });
    if (!imageResponse.ok) throw new Error("Не удалось загрузить фотографию товара из каталога.");
    const contentType = imageResponse.headers.get("content-type")?.split(";")[0] || "";
    if (!contentType.startsWith("image/")) throw new Error("Каталог вернул файл, который не является изображением.");
    const bytes = await imageResponse.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) throw new Error("Фотография товара имеет неподдерживаемый размер.");
    return new Blob([bytes], { type: contentType });
  };
  const imageSourceToBlob = isTechnicalLighting ? technicalImageSourceToBlob : furnitureImageSourceToBlob;
  const validatedEditImage = isTechnicalLighting ? validatedTechnicalEditImage : validatedFurnitureEditImage;
  const sampleInteriorBlob = async () => {
    const sample = await fetch("https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=90");
    if (!sample.ok) throw new Error("Не удалось загрузить исходный интерьер.");
    return new Blob([await sample.arrayBuffer()], { type: sample.headers.get("content-type") || "image/jpeg" });
  };

  const inferredOperation = body.lightingPlan ? "plan_render" : body.lightingEdit ? "place" : body.planRender ? "plan_render" : body.upscale ? "upscale" : body.material ? "material" : body.templateEdit || body.globalEdit ? "global_edit" : body.removal ? "remove" : body.replacement ? "replace" : body.furnitureCasting || body.placement ? "place" : body.adjustment ? "adjust" : "generate";
  const requestedOperation = body.operation?.trim();
  const supportedOperations = new Set(["plan_render", "upscale", "material", "global_edit", "remove", "replace", "place", "adjust", "generate"]);
  if (requestedOperation && (!supportedOperations.has(requestedOperation) || requestedOperation !== inferredOperation)) {
    return Response.json({ error: "Тип AI-операции не соответствует переданным данным." }, { status: 400 });
  }
  const operation = requestedOperation || inferredOperation;
  if (operation === "material" && (body.placement || body.replacement || body.removal || body.adjustment || body.globalEdit || body.planRender || body.upscale || body.product)) {
    return Response.json({ error: "Material operation не может выполнять добавление, замену или удаление объекта." }, { status: 400 });
  }
  let technicalOperationRegistration: "created" | "existing" | null = null;
  if (isTechnicalLighting) {
    const registration = await registerTechnicalLightingOperation({
      requestId: operationId,
      requestFingerprint,
      operationType: operation,
      userId: user.id,
      tenantId: user.tenantId,
    });
    if (registration === "conflict") {
      return Response.json({ error: "Идентификатор операции уже используется другим запросом." }, { status: 409 });
    }
    technicalOperationRegistration = registration;
    const completed = await database.prepare("SELECT id, output_key, content_type FROM generations WHERE id = ? AND user_id = ?").bind(operationId, user.id).first<{ id: string; output_key: string; content_type: string }>();
    if (completed) {
      const existingOutput = await storage().get(completed.output_key);
      if (existingOutput) {
        trace("idempotency_replay", "succeeded", { outputBytes: existingOutput.size, beforeInputPreflight: true });
        return new Response(existingOutput.body, { headers: { "Content-Type": completed.content_type || "image/webp", "Cache-Control": "no-store", "X-Operation-Id": operationId, "X-Generation-Replayed": "1" } });
      }
      trace("idempotency_replay", "failed", { error: "stored_output_missing", beforeInputPreflight: true });
      return Response.json({ error: "Результат этой AI-операции записан, но файл изображения недоступен. Новая генерация с тем же идентификатором заблокирована." }, { status: 409 });
    }
    if (technicalOperationRegistration === "existing") {
      trace("idempotency_pending", "succeeded", { beforeInputPreflight: true });
      return Response.json({ status: "pending", operationId, message: "Операция уже выполняется. Новый запрос провайдеру не отправлен." }, { status: 202, headers: { "Cache-Control": "no-store", "X-Operation-Id": operationId } });
    }
  }
  const operationDeadline = isTechnicalLighting ? AbortSignal.timeout(180_000) : undefined;
  let preparedLightingPlan: ValidatedImage | null = null;
  let preparedLightingRoom: ValidatedImage | null = null;
  let preparedLightingOverlay: ValidatedImage | null = null;
  let preparedLightingReferences: ValidatedImage[] = [];
  if (body.lightingPlan) {
    try {
      if (lightingManifestError) throw lightingManifestError;
      preparedLightingPlan = await validatedImageSource(body.lightingPlan.planImage || "", operationDeadline, "план технического света", "PLAN");
      if (!(body.lightingPlan.trackCount || body.lightingPlan.fixtureCount)) throw new Error("Добавьте трек или светильник на план.");
      if (body.lightingPlan.products?.some((product) => product.source === "reference" && (!product.widthMm || !product.lengthMm))) throw new Error("Укажите ширину и длину для каждого пользовательского референса.");
      preparedLightingReferences = await Promise.all(orderedLightingReferences.map((reference) => validatedImageSource(reference.source, operationDeadline, `референс ${reference.article || reference.productId}`, reference.assetId)));
      trace("prompt_build", "succeeded", { promptChars: lightingPlanPrompt.length, promptHash: createHash("sha256").update(lightingPlanPrompt).digest("hex").slice(0, 16) });
    } catch (error) {
      trace("input_preflight", "failed", { error: error instanceof Error ? error.message : "unknown" });
      return Response.json({ error: error instanceof Error ? error.message : "Некорректные данные плана." }, { status: 400 });
    }
  } else if (body.lightingEdit) {
    try {
      if (lightingManifestError) throw lightingManifestError;
      preparedLightingRoom = await validatedImageSource(body.roomImage || "", operationDeadline, "текущее изображение", "ROOM_BASE");
      preparedLightingOverlay = await validatedImageSource(body.lightingEdit.overlayImage || "", operationDeadline, "изображение с разметкой света", "OVERLAY");
      if (preparedLightingOverlay.mime === "image/png" && preparedLightingOverlay.bytes > 512 * 1024) {
        const originalBytes = preparedLightingOverlay.bytes;
        const compactBytes = await (await loadTechnicalSharp())(await preparedLightingOverlay.blob.arrayBuffer()).webp({ lossless: true, effort: 4 }).toBuffer();
        if (compactBytes.byteLength < originalBytes) {
          const compactArray = Uint8Array.from(compactBytes);
          preparedLightingOverlay = { ...preparedLightingOverlay, blob: new Blob([compactArray], { type: "image/webp" }), bytes: compactArray.byteLength, mime: "image/webp", sha256: createHash("sha256").update(compactArray).digest("hex") };
          trace("overlay_compact", "succeeded", { originalBytes, compactBytes: compactArray.byteLength, lossless: true });
        }
      }
      if (!(body.lightingEdit.trackCount || body.lightingEdit.fixtureCount)) throw new Error("Добавьте трек или светильник на изображение.");
      if (body.lightingEdit.products?.some((product) => product.source === "reference" && (!product.widthMm || !product.lengthMm))) throw new Error("Укажите ширину и длину для каждого пользовательского референса.");
      preparedLightingReferences = await Promise.all(orderedLightingReferences.map((reference) => validatedImageSource(reference.source, operationDeadline, `референс ${reference.article || reference.productId}`, reference.assetId)));
      trace("prompt_build", "succeeded", { promptChars: lightingEditPrompt.length, promptHash: createHash("sha256").update(lightingEditPrompt).digest("hex").slice(0, 16) });
    } catch (error) {
      trace("input_preflight", "failed", { error: error instanceof Error ? error.message : "unknown" });
      return Response.json({ error: error instanceof Error ? error.message : "Некорректные данные изображения." }, { status: 400 });
    }
  } else if (["global_edit", "material", "remove", "replace", "place"].includes(operation)) {
    try {
      await validatedEditImage(body.roomImage, "текущее изображение");
      if (operation === "global_edit" && !body.globalEdit?.instruction?.trim() && !body.templateEdit?.instructions?.trim()) throw new Error("Опишите изменение изображения.");
      if (body.templateEdit) {
        if (!/^[a-z0-9-]{1,80}$/.test(body.templateEdit.templateId || "")) throw new Error("Некорректный идентификатор Template.");
        if (rawTemplateReferenceImages.length > maxTemplateReferenceImages) throw new Error(isMoodboardComposition ? "Для одного мудборда можно использовать не более 16 изображений." : "Можно использовать не более десяти референсов.");
        for (const [index, source] of templateReferenceImages.entries()) await validatedEditImage(source, `референс ${index + 1}`);
      }
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
        if (body.furnitureReference && [body.furnitureReference.widthMm, body.furnitureReference.depthMm, body.furnitureReference.heightMm].some((value) => !Number.isFinite(value) || Number(value) <= 0)) throw new Error("Укажите ширину, глубину и высоту пользовательского референса.");
        if (body.referenceImage.startsWith("data:")) await validatedEditImage(body.referenceImage, operation === "material" ? "референс материала" : "референс предмета");
        else {
          const url = new URL(body.referenceImage);
          if (url.protocol !== "https:" || !supportedCatalogHost(url.hostname)) throw new Error("Источник референса материала не поддерживается.");
        }
      }
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Некорректные данные изображения." }, { status: 400 });
    }
  }
  const diagnosticBranch = body.lightingPlan ? "lighting_plan"
    : body.lightingEdit ? "lighting_edit"
    : body.roomImage && body.furnitureCasting?.markedImage && furnitureCastingItems.length ? "furniture_casting"
    : body.roomImage && body.templateEdit?.instructions ? "template_edit"
    : body.roomImage && body.referenceImage && body.material && body.pointEdit?.markedImage ? "material"
    : body.roomImage && body.globalEdit?.instruction ? "global_edit"
    : body.roomImage && body.referenceImage && body.replacement && body.pointEdit?.markedImage ? "replace"
    : body.roomImage && body.removal && body.pointEdit?.markedImage ? "remove"
    : body.roomImage && body.placement && body.pointEdit?.markedImage && (body.referenceImage || body.product) ? "add"
    : "other";
  const diagnosticMaskPresent = Boolean(body.adjustment?.mask);
  const diagnosticProviderInputImages = diagnosticBranch === "lighting_plan" ? 1 + orderedLightingReferences.length
    : diagnosticBranch === "lighting_edit" ? 2 + orderedLightingReferences.length
    : diagnosticBranch === "furniture_casting" ? 2 + furnitureCastingItems.length
    : diagnosticBranch === "template_edit" ? 1 + templateReferenceImages.length
    : diagnosticBranch === "material" || diagnosticBranch === "replace" || diagnosticBranch === "add" && Boolean(body.referenceImage) ? 3
    : diagnosticBranch === "remove" || diagnosticBranch === "add" || Boolean(body.roomImage) && Boolean(body.pointEdit?.markedImage) ? 2
    : diagnosticBranch === "global_edit" || Boolean(body.roomImage) ? 1
    : 0;
  const diagnosticProviderEndpoint = body.roomImage || body.planRender?.planImage || body.lightingPlan?.planImage ? "openai.images.edits" : "openai.images.generations";
  if (!isTechnicalLighting && (await database.prepare("SELECT id FROM generations WHERE id = ? AND user_id = ?").bind(operationId, user.id).first() || await aiCostLedgerHasRequest(operationId))) {
    return Response.json({ error: "Эта AI-операция уже выполнена." }, { status: 409 });
  }
  if (await database.prepare("SELECT id FROM token_transactions WHERE user_id = ? AND idempotency_key = ?").bind(user.id, `ai-refund:${operationId}`).first()) {
    return Response.json({ error: "Эта AI-операция уже завершилась ошибкой. Повторите попытку как новую операцию." }, { status: 409 });
  }
  let reservation: Awaited<ReturnType<typeof reserveAiTokens>>;
  try {
    reservation = await reserveAiTokens(user.id, operation, operationId, `ai-reserve:${user.id}:${operationId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Недостаточно токенов.";
    return Response.json({ error: message }, { status: message.includes("Недостаточно") ? 402 : 400 });
  }
  let refererProjectId: string | null = null;
  try { refererProjectId = new URL(request.headers.get("referer") || "http://localhost").searchParams.get("project")?.trim() || null; } catch { /* malformed Referer is ignored */ }
  const requestedProjectId = body.projectId?.trim() || refererProjectId;
  const projectId = requestedProjectId && await database.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ? AND tenant_id = ?").bind(requestedProjectId, user.id, user.tenantId).first()
    ? requestedProjectId
    : null;
  try {
    await createAiCostLedgerEntry({
      requestId: operationId,
      userId: user.id,
      tenantId: user.tenantId,
      projectId,
      operationType: operation,
      model,
      endpoint: diagnosticProviderEndpoint,
      rdTokensCharged: reservation.transaction ? reservation.quote.tokenCost : 0,
      rdTokensQuoted: reservation.quote.tokenCost,
      grossCoefficient: reservation.quote.bruttoCoefficient,
    });
  } catch (error) {
    if (reservation.transaction) await refundAiTokens(user.id, operationId, reservation.quote.tokenCost, "Возврат: не удалось открыть финансовый журнал AI-операции");
    console.error("AI cost ledger creation failed", error);
    return Response.json({ error: "Не удалось безопасно начать учёт AI-операции." }, { status: 503 });
  }
  let refunded = false;
  const refundReservation = async (reason: string) => {
    if (reservation.transaction && !refunded) {
      await refundAiTokens(user.id, operationId, reservation.quote.tokenCost, reason);
      refunded = true;
    }
  };
  const providerTimeout = isTechnicalLighting ? operationDeadline : body.lightingPlan || body.lightingEdit || ["material", "global_edit", "remove", "replace", "place"].includes(operation) ? AbortSignal.timeout(body.furnitureCasting || isMoodboardComposition ? 360_000 : 180_000) : undefined;
  const providerTimedOut = (error?: unknown) => providerTimeout?.aborted || error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  const providerTimeoutMessage = body.furnitureCasting ? "Создание единого рендера заняло больше 6 минут. Попробуйте ещё раз с фотографиями меньшего размера." : isMoodboardComposition ? "Сборка мудборда заняла больше 6 минут. Попробуйте ещё раз с меньшим количеством или размером изображений." : "Сервис генерации не ответил вовремя. Попробуйте ещё раз.";

  const fetchCorrectionProvider = async (form: FormData, branch: string) => {
    if (!isTechnicalLighting) return fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    trace("multipart_build", "succeeded", { attempt: 1, branch, imageCount: form.getAll("image[]").length, binaryPayloadBytes: form.getAll("image[]").reduce((total, value) => total + (value instanceof Blob ? value.size : 0), 0) });
    trace("provider_submit", "begin", { attempt: 1, maximumAttempts: 1, branch, deadlineRemainingMs: Math.max(0, 180_000 - (Date.now() - traceStartedAt)) });
    try {
      const providerResponse = await fetchWithNetworkRetry("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout }, 1);
      trace("provider_headers", providerResponse.ok ? "succeeded" : "failed", { attempt: 1, branch, httpStatus: providerResponse.status, providerRequestId: providerResponse.headers.get("x-request-id") || providerResponse.headers.get("request-id") || null });
      return providerResponse;
    } catch (error) {
      trace("provider_submit", "failed", { attempt: 1, branch, outcome: "unknown_provider_outcome", ...safeNetworkError(error) });
      throw error;
    }
  };

  const fetchLightingProvider = async (formFactory: () => FormData) => {
    const maximumAttempts = disableProviderRetry ? 1 : 2;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const form = formFactory();
      trace("multipart_build", "succeeded", { attempt, imageCount: form.getAll("image[]").length, binaryPayloadBytes: form.getAll("image[]").reduce((total, value) => total + (value instanceof Blob ? value.size : 0), 0) });
      trace("provider_submit", "begin", { attempt, maximumAttempts, deadlineRemainingMs: Math.max(0, 180_000 - (Date.now() - traceStartedAt)) });
      let providerResponse: Response;
      try {
        providerResponse = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
      } catch (error) {
        trace("provider_submit", "failed", { attempt, outcome: "unknown_provider_outcome", ...safeNetworkError(error) });
        throw new Error("Не удалось подтвердить ответ сервиса генерации. Автоматический повтор не выполнялся, чтобы не создать дубликат. Попробуйте ещё раз через минуту.");
      }
      const providerRequestId = providerResponse.headers.get("x-request-id") || providerResponse.headers.get("request-id") || null;
      trace("provider_headers", providerResponse.ok ? "succeeded" : "failed", { attempt, httpStatus: providerResponse.status, providerRequestId });
      const retryableResponse = providerResponse.status === 429 || providerResponse.status >= 500;
      if (!retryableResponse || attempt === maximumAttempts) {
        const contentType = providerResponse.headers.get("content-type") || "";
        if (!providerResponse.ok || !contentType.includes("text/event-stream")) return providerResponse;
        if (!providerResponse.body) throw new Error("Поток генерации не содержит данных.");
        trace("provider_stream", "begin", { attempt, providerRequestId });
        const reader = providerResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const completed: { value: { b64_json?: string; usage?: ImageProviderUsage } | null } = { value: null };
        let eventCount = 0;
        let partialCount = 0;
        const consumeBlock = (block: string) => {
          const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (!data || data === "[DONE]") return;
          const event = JSON.parse(data) as { type?: string; b64_json?: string; partial_image_index?: number; usage?: ImageProviderUsage };
          eventCount += 1;
          if (event.type === "image_edit.partial_image") partialCount += 1;
          trace("provider_stream_event", "succeeded", { attempt, eventType: event.type || "unknown", partialImageIndex: event.partial_image_index ?? null });
          if (event.type === "image_edit.completed") completed.value = event;
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() || "";
            blocks.forEach(consumeBlock);
            if (done) break;
          }
          if (buffer.trim()) consumeBlock(buffer);
        } catch (error) {
          trace("provider_stream", "failed", { attempt, providerRequestId, eventCount, partialCount, outcome: "unknown_provider_outcome", ...safeNetworkError(error) });
          throw error;
        }
        if (!completed.value?.b64_json) throw new Error("Сервис генерации завершил поток без готового изображения.");
        trace("provider_stream", "succeeded", { attempt, providerRequestId, eventCount, partialCount });
        const headers = new Headers(providerResponse.headers);
        headers.set("content-type", "application/json");
        return new Response(JSON.stringify({ data: [{ b64_json: completed.value.b64_json }], usage: completed.value.usage }), { status: providerResponse.status, headers });
      }
      const retryAfter = Number(providerResponse.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : attempt * 500;
      trace("provider_retry", "begin", { attempt, nextAttempt: attempt + 1, reason: providerResponse.status === 429 ? "rate_limit" : "provider_5xx", delayMs });
      await providerResponse.body?.cancel().catch(() => undefined);
      await wait(delayMs);
    }
    throw new Error("Сервис генерации не вернул ответ.");
  };

  let response: Response;
  try {
    if (body.lightingPlan?.planImage) {
      response = await fetchLightingProvider(() => {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", lightingPlanPrompt);
        form.append("image[]", preparedLightingPlan!.blob, `ceiling-lighting-plan.${preparedLightingPlan!.mime.split("/")[1]}`);
        preparedLightingReferences.forEach((image, index) => form.append("image[]", image.blob, `lighting-reference-${index + 1}.${image.mime.split("/")[1]}`));
        form.append("size", outputSize);
        form.append("quality", "high");
        form.append("output_format", "webp");
        form.append("stream", "true");
        form.append("partial_images", "1");
        return form;
      });
    } else if (body.roomImage && body.lightingEdit?.overlayImage) {
      response = await fetchLightingProvider(() => {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", lightingEditPrompt);
        form.append("image[]", preparedLightingRoom!.blob, `clean-interior.${preparedLightingRoom!.mime.split("/")[1]}`);
        form.append("image[]", preparedLightingOverlay!.blob, `lighting-overlay.${preparedLightingOverlay!.mime.split("/")[1]}`);
        preparedLightingReferences.forEach((image, index) => form.append("image[]", image.blob, `lighting-reference-${index + 1}.${image.mime.split("/")[1]}`));
        form.append("size", outputSize);
        form.append("quality", "high");
        form.append("output_format", "webp");
        form.append("stream", "true");
        form.append("partial_images", "3");
        return form;
      });
    } else if (body.planRender?.planImage) {
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
      form.append("image[]", isTechnicalLighting ? await imageSourceToBlob(body.roomImage, providerTimeout) : dataUrlToBlob(body.roomImage), "source-image.png");
      form.append("size", outputSize);
      form.append("quality", "high");
      form.append("output_format", "webp");
      response = await fetchCorrectionProvider(form, "upscale");
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
    } else if (body.roomImage && body.templateEdit?.instructions) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", templateEditPrompt);
      form.append("image[]", dataUrlToBlob(body.roomImage), "primary-source.png");
      const referenceBlobs = await Promise.all(templateReferenceImages.map((source) => imageSourceToBlob(source, providerTimeout)));
      referenceBlobs.forEach((referenceBlob, index) => form.append("image[]", referenceBlob, `template-reference-${index + 1}.${referenceBlob.type.split("/")[1] || "jpg"}`));
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form, signal: providerTimeout });
    } else if (body.roomImage && body.globalEdit?.instruction) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", globalEditPrompt);
      form.append("image[]", isTechnicalLighting ? await imageSourceToBlob(body.roomImage, providerTimeout) : dataUrlToBlob(body.roomImage), "current-interior.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetchCorrectionProvider(form, "global_edit");
    } else if (body.roomImage && body.pointEdit?.markedImage && body.referenceImage && body.replacement) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", replacementPrompt);
      form.append("image[]", isTechnicalLighting ? await imageSourceToBlob(body.roomImage, providerTimeout) : dataUrlToBlob(body.roomImage), "clean-interior.png");
      form.append("image[]", dataUrlToBlob(body.pointEdit.markedImage), "marked-interior.png");
      const referenceBlob = await imageSourceToBlob(body.referenceImage, providerTimeout);
      form.append("image[]", referenceBlob, `furniture-reference.${referenceBlob.type.split("/")[1] || "jpg"}`);
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetchCorrectionProvider(form, "replace");
    } else if (body.roomImage && body.pointEdit?.markedImage && body.removal) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", removalPrompt);
      form.append("image[]", isTechnicalLighting ? await imageSourceToBlob(body.roomImage, providerTimeout) : dataUrlToBlob(body.roomImage), "clean-interior.png");
      form.append("image[]", dataUrlToBlob(body.pointEdit.markedImage), "marked-interior.png");
      form.append("size", outputSize);
      form.append("quality", "medium");
      form.append("output_format", "webp");
      response = await fetchCorrectionProvider(form, "remove");
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
    await completeAiCostLedgerEntry(operationId, "provider_failed", null, providerTimedOut(error) ? "provider_timeout" : "provider_request_failed");
    await refundReservation("Возврат после технической ошибки подготовки AI-операции");
    trace("provider_submit", "failed", { outcome: providerTimedOut(error) ? "timeout" : "request_failed", ...safeNetworkError(error) });
    return Response.json({ error: providerTimedOut(error) ? providerTimeoutMessage : error instanceof Error ? error.message : "Не удалось подготовить изображения." }, { status: providerTimedOut(error) ? 504 : 400 });
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
    trace("provider_body", "succeeded", { httpStatus: response.status, responseBytes: new TextEncoder().encode(responseText).byteLength });
  } catch {
    await completeAiCostLedgerEntry(operationId, "provider_response_read_failed", null, "provider_response_read_failed");
    await refundReservation("Возврат после ошибки чтения ответа AI-провайдера");
    trace("provider_body", "failed", { httpStatus: response.status });
    return Response.json({ error: providerTimedOut() ? providerTimeoutMessage : "Не удалось получить ответ сервиса генерации." }, { status: providerTimedOut() ? 504 : 502 });
  }
  let result: { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string }; usage?: ImageProviderUsage } = {};
  try {
    result = JSON.parse(responseText);
  } catch {
    // A proxy or a transient gateway error can return HTML instead of JSON.
    // Keep the response actionable without exposing provider internals.
  }
  const providerRequestId = response.headers.get("x-request-id") || response.headers.get("request-id");
  await recordAiProviderResult({
    requestId: operationId,
    model,
    endpoint: diagnosticProviderEndpoint,
    grossCoefficient: reservation.quote.bruttoCoefficient,
    providerRequestId,
    providerHttpStatus: response.status,
    usage: result.usage,
    status: response.ok ? "provider_succeeded" : "provider_failed",
    errorCode: response.ok ? null : `provider_http_${response.status}`,
  });
  if (!response.ok) {
    await completeAiCostLedgerEntry(operationId, "provider_failed", null, `provider_http_${response.status}`);
    await refundReservation("Возврат после ошибки AI-провайдера");
    console.error("Image edit failed", { status: response.status, operation, message: result.error?.message });
    trace("provider_result", "failed", { httpStatus: response.status, errorType: "provider_error" });
    return Response.json({ error: result.error?.message || `Сервис генерации временно недоступен (код ${response.status}). Попробуйте ещё раз.` }, { status: response.status });
  }

  const encodedImage = result.data?.[0]?.b64_json;
  if (!encodedImage) {
    await completeAiCostLedgerEntry(operationId, "result_invalid", null, "missing_image");
    await refundReservation("Возврат: AI-провайдер не вернул изображение");
    trace("output_decode", "failed", { error: "missing_b64_json" });
    return Response.json({ error: "Изображение не вернулось от модели." }, { status: 502 });
  }

  let binary: Uint8Array<ArrayBuffer>;
  try {
    binary = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
    if (!binary.byteLength) throw new Error("Пустое изображение.");
    trace("output_decode", "succeeded", { outputBytes: binary.byteLength, outputSha256: createHash("sha256").update(binary).digest("hex").slice(0, 16) });
  } catch {
    await completeAiCostLedgerEntry(operationId, "result_invalid", null, "invalid_image");
    await refundReservation("Возврат после некорректного изображения AI-провайдера");
    return Response.json({ error: "Сервис генерации вернул некорректное изображение." }, { status: 502 });
  }
  const outputKey = `${tenantStoragePrefix(user)}/generations/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.webp`;
  try {
    trace("storage_write", "begin", { outputKeyHash: createHash("sha256").update(outputKey).digest("hex").slice(0, 16) });
    await storage().put(outputKey, binary, { httpMetadata: { contentType: "image/webp" } });
    trace("storage_write", "succeeded", { outputBytes: binary.byteLength });
    const tokenTransaction = reservation.transaction as { id?: string } | null;
    const recordedPrompt = body.lightingPlan ? lightingPlanPrompt : body.lightingEdit ? lightingEditPrompt : body.prompt || "";
    await recordGeneration(user, { id: operationId, operation, prompt: recordedPrompt, outputKey, contentType: "image/webp", bytes: binary.byteLength, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens, totalTokens: result.usage?.total_tokens, tokenTransactionId: tokenTransaction?.id || null, tokenCost: reservation.quote.tokenCost, bruttoCoefficientSnapshot: reservation.quote.bruttoCoefficient });
    trace("generation_record", "succeeded", { usageInputTokens: result.usage?.input_tokens ?? null, usageOutputTokens: result.usage?.output_tokens ?? null, localTokenCharge: reservation.quote.tokenCost });
  } catch (error) {
    await completeAiCostLedgerEntry(operationId, "result_save_failed", null, "result_save_failed");
    await refundReservation("Возврат после ошибки сохранения результата AI-операции");
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить результат генерации." }, { status: 503 });
  }
  await completeAiCostLedgerEntry(operationId, "succeeded", operationId);
  trace("response_deliver", "succeeded", { outputBytes: binary.byteLength });
  const usageHeaders: Record<string, string> = {
    "Content-Type": "image/webp",
    "Cache-Control": "no-store",
    "X-Room-AI-Model": model,
    "X-Room-AI-Operation": operation,
    "X-Room-AI-Token-Cost": String(reservation.quote.tokenCost),
    "X-Room-AI-Charging": reservation.quote.chargingEnabled ? "enabled" : "estimate-only",
    "X-Operation-Id": operationId,
    "X-Provider-Request-Id": providerRequestId || "",
    "X-Technical-Lighting-Template": isTechnicalLighting ? TECHNICAL_LIGHTING_TEMPLATE_VERSION : "",
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
