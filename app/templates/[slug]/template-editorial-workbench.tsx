"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- scrollable history regions are intentionally keyboard-focusable */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type ReactNode, type WheelEvent } from "react";

import { downloadImageAsJpeg } from "@/lib/client-image-download";
import type { TemplateDefinition, TemplateInputSlot } from "@/lib/templates/types";

type SourceImage = { id: string; name: string; type: string; size: number; dataUrl: string; sourceUrl?: string; createdAt: string };
type LegacySourceImage = SourceImage & { ownerId?: string };
type Point = { x: number; y: number };
type GenerationItem = { id: string; name: string; dataUrl: string; createdAt: string; productCount: number };
type User = { id: string; email: string; firstName?: string; lastName?: string };
type Phase = "idle" | "processing" | "failed";
type SlotState = "empty" | "uploading" | "error";

export type TemplateWorkbenchConfig = {
  templateNumber: string;
  templateTitle: string;
  templateSubtitle: string;
  templateDescription: string;
  primaryInputLabel: string;
  primaryInputHelp: string;
  additionalInputsLabel: string;
  additionalInputsHelp: string;
  maxAdditionalInputs: number;
  templateId: string;
};

const LIVE_PLACEMENT_TEMPLATE = "furniture-casting";
const LIVE_PLACEMENT_PROMPT = "Мебельный кастинг: разместить все выбранные предметы в указанных точках одним цельным рендером, сохранив комнату и ракурс.";
const FINAL_RENDER_MARKER = "final:yes";
const LEGACY_ASSET_DATABASE = "room-design-furniture-library";
const LEGACY_ASSET_STORE = "products";

const isFileSlot = (slot: TemplateInputSlot) => !["choice", "short_text"].includes(slot.kind);

export function createTemplateWorkbenchConfig(template: TemplateDefinition): TemplateWorkbenchConfig {
  const fileSlots = template.inputSlots.filter(isFileSlot);
  const primary = fileSlots[0];
  const additional = fileSlots[1];
  return {
    templateNumber: template.id,
    templateTitle: template.title,
    templateSubtitle: template.hook,
    templateDescription: template.description,
    primaryInputLabel: "Основное изображение",
    primaryInputHelp: primary?.helper || primary?.label || "Загрузите исходное изображение для обработки.",
    additionalInputsLabel: "Дополнительные изображения",
    additionalInputsHelp: additional?.helper || additional?.label || "Добавьте визуальные референсы для результата.",
    maxAdditionalInputs: additional?.maxCount || 5,
    templateId: template.slug,
  };
}

const readFile = (file: File, maxDimension: number) => new Promise<SourceImage>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const originalDataUrl = String(reader.result || "");
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale === 1) return resolve({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, dataUrl: originalDataUrl, createdAt: new Date().toISOString() });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Не удалось подготовить изображение."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/webp", 0.9);
      resolve({ id: crypto.randomUUID(), name: file.name, type: "image/webp", size: Math.round(dataUrl.length * 0.75), dataUrl, createdAt: new Date().toISOString() });
    };
    image.onerror = () => reject(new Error(`${file.name}: не удалось прочитать изображение.`));
    image.src = originalDataUrl;
  };
  reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
  reader.readAsDataURL(file);
});

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Не удалось подготовить изображение."));
  reader.readAsDataURL(blob);
});

const resolveDataUrl = async (image: SourceImage) => image.dataUrl.startsWith("data:") ? image.dataUrl : blobToDataUrl(await fetch(image.sourceUrl || image.dataUrl).then((response) => {
  if (!response.ok) throw new Error(`Не удалось открыть «${image.name}».`);
  return response.blob();
}));

const createPlacementGuideImage = (source: string, items: Array<{ point: Point; number: number }>) => new Promise<string>((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return reject(new Error("Не удалось подготовить выбранные точки."));
    context.drawImage(image, 0, 0);
    const radius = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
    for (const item of items) {
      const x = canvas.width * item.point.x / 100;
      const y = canvas.height * item.point.y / 100;
      context.save();
      context.fillStyle = "#8f001d";
      context.strokeStyle = "#fff";
      context.lineWidth = Math.max(4, radius * 0.2);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#fff";
      context.font = `700 ${Math.round(radius * 1.1)}px Arial`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(item.number), x, y + 1);
      context.restore();
    }
    resolve(canvas.toDataURL("image/png"));
  };
  image.onerror = () => reject(new Error("Не удалось подготовить основное изображение."));
  image.src = source;
});

const validateFile = (slot: TemplateInputSlot, file: File) => {
  if (slot.acceptedMimeTypes.length && !slot.acceptedMimeTypes.includes(file.type)) throw new Error(`${file.name}: неподдерживаемый тип файла.`);
  if (slot.maxBytes && file.size > slot.maxBytes) throw new Error(`${file.name}: файл превышает допустимый размер.`);
};

const loadLegacyAssets = async (ownerId: string) => {
  if (!("indexedDB" in window)) return [] as SourceImage[];
  return new Promise<SourceImage[]>((resolve) => {
    const request = indexedDB.open(LEGACY_ASSET_DATABASE, 1);
    request.onerror = () => resolve([]);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LEGACY_ASSET_STORE)) request.result.createObjectStore(LEGACY_ASSET_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(LEGACY_ASSET_STORE, "readonly");
      const read = transaction.objectStore(LEGACY_ASSET_STORE).getAll();
      read.onerror = () => { database.close(); resolve([]); };
      read.onsuccess = () => {
        const assets = (read.result as LegacySourceImage[]).filter((item) => item.ownerId === ownerId).map((item) => ({ id: item.id, name: item.name, type: item.type, size: item.size, dataUrl: item.dataUrl, sourceUrl: item.sourceUrl, createdAt: item.createdAt }));
        database.close();
        resolve(assets);
      };
    };
  });
};

async function saveSourceImage(templateId: string, image: SourceImage) {
  const response = await fetch("/api/account/template-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId, name: image.name, dataUrl: image.dataUrl, clientId: image.id }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить изображение в истории.");
  return { ...image, ...payload.asset, dataUrl: image.dataUrl, sourceUrl: payload.asset.sourceUrl } as SourceImage;
}

function HistoryRail({ id, title, description, count, empty, children }: { id: string; title: string; description: string; count: number; empty: string; children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      setCanBack(viewport.scrollLeft > 2);
      setCanForward(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 2);
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => { viewport.removeEventListener("scroll", update); observer.disconnect(); };
  }, [count]);
  const shiftWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || !event.deltaY) return;
    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  };
  const move = (direction: -1 | 1) => viewportRef.current?.scrollBy({ left: direction * Math.max(260, viewportRef.current.clientWidth * 0.72), behavior: "smooth" });
  return <section className="editorial-history" aria-labelledby={id}>
    <header>
      <div><h2 id={id}>{title}</h2><p>{description}</p></div>
      <nav aria-label={`Прокрутка: ${title}`}>
        <button type="button" onClick={() => move(-1)} disabled={!canBack} aria-label="Прокрутить назад">←</button>
        <button type="button" onClick={() => move(1)} disabled={!canForward} aria-label="Прокрутить вперёд">→</button>
      </nav>
    </header>
    {count ? <div className="editorial-history-viewport" ref={viewportRef} onWheel={shiftWheel} onKeyDown={(event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }} tabIndex={0} role="region" aria-label={title}>{children}</div> : <p className="editorial-history-empty">{empty}</p>}
  </section>;
}

export default function TemplateEditorialWorkbench({ template }: { template: TemplateDefinition }) {
  const config = useMemo(() => createTemplateWorkbenchConfig(template), [template]);
  const fileSlots = useMemo(() => template.inputSlots.filter(isFileSlot), [template]);
  const primarySlot = fileSlots[0];
  const additionalSlot = fileSlots[1];
  const maxSlots = config.maxAdditionalInputs;
  const [primaryImage, setPrimaryImage] = useState<SourceImage | null>(null);
  const [sourceHistory, setSourceHistory] = useState<SourceImage[]>([]);
  const [activeIds, setActiveIds] = useState<Array<string | null>>(() => Array.from({ length: maxSlots }, () => null));
  const [slotStates, setSlotStates] = useState<SlotState[]>(() => Array.from({ length: maxSlots }, () => "empty"));
  const [placements, setPlacements] = useState<Record<string, Point>>({});
  const [placingId, setPlacingId] = useState("");
  const [editingDraft, setEditingDraft] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [generationHistory, setGenerationHistory] = useState<GenerationItem[]>([]);
  const [latestResult, setLatestResult] = useState<GenerationItem | null>(null);
  const [lightbox, setLightbox] = useState<GenerationItem | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [generationConfigured, setGenerationConfigured] = useState(false);
  const [draggedAssetId, setDraggedAssetId] = useState("");
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const activeImages = useMemo(() => activeIds.map((id) => id ? sourceHistory.find((item) => item.id === id) || null : null), [activeIds, sourceHistory]);
  const selectedImages = useMemo(() => activeImages.filter((item): item is SourceImage => Boolean(item)), [activeImages]);
  const missingPoint = selectedImages.find((item) => !placements[item.id]);
  const activeImage = sourceHistory.find((item) => item.id === placingId) || null;
  const completedPoints = selectedImages.filter((item) => placements[item.id]).length;
  const isLiveFlow = template.slug === LIVE_PLACEMENT_TEMPLATE;
  const ready = Boolean(primaryImage && selectedImages.length && !missingPoint && user && generationConfigured && isLiveFlow && phase !== "processing");
  const showDraft = Boolean(primaryImage && editingDraft);
  const stageImage = showDraft ? primaryImage?.dataUrl : latestResult?.dataUrl || primaryImage?.dataUrl;

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [meResponse, healthResponse] = await Promise.all([fetch("/api/auth/me"), fetch("/api/health")]);
      const me = await meResponse.json().catch(() => ({ user: null }));
      const health = await healthResponse.json().catch(() => ({}));
      if (!active) return;
      setUser(me.user || null);
      setAuthChecked(true);
      setGenerationConfigured(Boolean(health.imageGeneration?.configured));
      if (!me.user) return;
      const [assetResponse, generationResponse, legacyAssets] = await Promise.all([
        fetch("/api/account/template-assets"),
        fetch("/api/account/generations"),
        loadLegacyAssets(me.user.id),
      ]);
      const assetPayload = await assetResponse.json().catch(() => ({ assets: [] }));
      const generationPayload = await generationResponse.json().catch(() => ({ generations: [] }));
      if (!active) return;
      const storedAssets = assetResponse.ok ? (assetPayload.assets || []).map((asset: SourceImage & { sourceUrl: string }) => ({ ...asset, dataUrl: asset.sourceUrl })) : [];
      const knownIds = new Set(storedAssets.map((asset: SourceImage) => asset.id));
      const legacyMissing = legacyAssets.filter((asset) => !knownIds.has(asset.id));
      const migrated: SourceImage[] = [];
      for (const asset of legacyMissing) {
        try { migrated.push(await saveSourceImage(template.slug, asset)); } catch { migrated.push(asset); }
      }
      if (active) setSourceHistory([...storedAssets, ...migrated].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      if (!generationResponse.ok || template.slug !== LIVE_PLACEMENT_TEMPLATE) return;
      const storedGenerations = (generationPayload.generations || [])
        .filter((generation: { operation?: string; prompt?: string }) => generation.operation === "place" && generation.prompt?.startsWith(LIVE_PLACEMENT_PROMPT) && generation.prompt.includes(FINAL_RENDER_MARKER))
        .map((generation: { id: string; created_at: string; prompt: string }) => ({
          id: generation.id,
          name: template.title,
          dataUrl: `/api/account/generations/${generation.id}`,
          createdAt: generation.created_at,
          productCount: Number(generation.prompt.match(/items:(\d+)/)?.[1] || 1),
        }));
      setGenerationHistory(storedGenerations);
      if (storedGenerations[0]) setLatestResult(storedGenerations[0]);
    };
    void load().catch(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, [template.slug, template.title]);

  useEffect(() => {
    if (!lightbox) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [lightbox]);

  useEffect(() => {
    if (phase !== "processing") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const uploadPrimary = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !primarySlot) return;
    setError("");
    try {
      validateFile(primarySlot, file);
      setPrimaryImage(await readFile(file, 2048));
      setPlacements({});
      setPlacingId(selectedImages[0]?.id || "");
      setEditingDraft(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить основное изображение.");
    }
  };

  const uploadAdditional = async (slotIndex: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !additionalSlot) return;
    setError("");
    setSlotStates((current) => current.map((state, index) => index === slotIndex ? "uploading" : state));
    try {
      validateFile(additionalSlot, file);
      const local = await readFile(file, 1280);
      const saved = user ? await saveSourceImage(template.slug, local) : local;
      setSourceHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setActiveIds((current) => current.map((id, index) => index === slotIndex ? saved.id : id));
      setPlacements((current) => {
        const next = { ...current };
        const replacedId = activeIds[slotIndex];
        if (replacedId) delete next[replacedId];
        return next;
      });
      setPlacingId(saved.id);
      setEditingDraft(true);
      setSlotStates((current) => current.map((state, index) => index === slotIndex ? "empty" : state));
    } catch (reason) {
      setSlotStates((current) => current.map((state, index) => index === slotIndex ? "error" : state));
      setError(reason instanceof Error ? reason.message : "Не удалось добавить изображение.");
    }
  };

  const removeActive = (slotIndex: number) => {
    const id = activeIds[slotIndex];
    setActiveIds((current) => current.map((value, index) => index === slotIndex ? null : value));
    if (id) setPlacements((current) => { const next = { ...current }; delete next[id]; return next; });
    if (placingId === id) setPlacingId("");
    setEditingDraft(true);
    setError("");
  };

  const addFromHistory = (image: SourceImage) => {
    if (activeIds.includes(image.id)) return;
    const index = activeIds.findIndex((id) => !id);
    if (index < 0) return setError("Удалите одно из активных изображений, чтобы добавить другое.");
    addFromHistoryToSlot(image, index);
  };

  const canDropHistoryAt = (image: SourceImage | undefined, slotIndex: number) => Boolean(image && !activeIds.includes(image.id) && !activeIds[slotIndex] && additionalSlot?.acceptedMimeTypes.includes(image.type));

  const addFromHistoryToSlot = (image: SourceImage, slotIndex: number) => {
    if (!canDropHistoryAt(image, slotIndex)) return setError("Освободите этот слот или выберите другой материал.");
    setActiveIds((current) => current.map((id, itemIndex) => itemIndex === slotIndex ? image.id : id));
    setPlacingId(image.id);
    setEditingDraft(true);
    setError("");
  };

  const allowHistoryDrop = (event: DragEvent<HTMLElement>, slotIndex: number) => {
    const image = sourceHistory.find((item) => item.id === draggedAssetId);
    if (!canDropHistoryAt(image, slotIndex)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropTargetIndex(slotIndex);
  };

  const dropHistoryAsset = (event: DragEvent<HTMLElement>, slotIndex: number) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-room-design-asset") || draggedAssetId;
    const image = sourceHistory.find((item) => item.id === id);
    if (image) addFromHistoryToSlot(image, slotIndex);
    setDraggedAssetId("");
    setDropTargetIndex(null);
  };

  const selectPlacement = (image: SourceImage) => {
    setPlacingId(image.id);
    setEditingDraft(true);
    setError("");
  };

  const handleStageClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!placingId || !primaryImage || !showDraft) {
      if (latestResult && !showDraft) setLightbox(latestResult);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) * 100 / bounds.width, y: (event.clientY - bounds.top) * 100 / bounds.height };
    const nextPlacements = { ...placements, [placingId]: point };
    setPlacements(nextPlacements);
    const next = activeImages.find((image) => image && image.id !== placingId && !nextPlacements[image.id]);
    setPlacingId(next?.id || "");
    setError("");
  };

  const runGeneration = async () => {
    if (!primaryImage) return setError("Сначала загрузите основное изображение.");
    if (!selectedImages.length) return setError("Добавьте хотя бы одно дополнительное изображение.");
    if (missingPoint) { setPlacingId(missingPoint.id); setEditingDraft(true); return setError(`Укажите место для «${missingPoint.name}».`); }
    if (!user) return setError("Войдите в Room Design, чтобы создать рендер.");
    if (!generationConfigured) return setError("Генерация временно недоступна.");
    if (!isLiveFlow) return setError("Реальная генерация этого Template пока не подключена.");
    setError("");
    setElapsedSeconds(0);
    setPhase("processing");
    try {
      const roomDataUrl = await resolveDataUrl(primaryImage);
      const references = await Promise.all(selectedImages.map(resolveDataUrl));
      const markedImage = await createPlacementGuideImage(roomDataUrl, selectedImages.map((image, index) => ({ point: placements[image.id], number: activeIds.indexOf(image.id) + 1 || index + 1 })));
      const operationId = crypto.randomUUID();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
        body: JSON.stringify({
          operation: "place",
          prompt: `${LIVE_PLACEMENT_PROMPT} [items:${selectedImages.length}; ${FINAL_RENDER_MARKER}]`,
          roomImage: roomDataUrl,
          furnitureCasting: { markedImage, items: selectedImages.map((image, index) => ({ ...placements[image.id], name: image.name, referenceImage: references[index] })) },
          outputSize: "1536x1024",
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Не удалось создать рендер.");
      }
      const finalItem: GenerationItem = { id: operationId, name: template.title, dataUrl: await blobToDataUrl(await response.blob()), createdAt: new Date().toISOString(), productCount: selectedImages.length };
      setGenerationHistory((current) => [finalItem, ...current.filter((entry) => entry.id !== finalItem.id)]);
      setLatestResult(finalItem);
      setEditingDraft(false);
      setPhase("idle");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Генерация не завершилась.");
      setPhase("failed");
    }
  };

  const resultTitle = phase === "processing" ? "Создаём ваш рендер" : showDraft ? placingId ? `Укажите место: ${activeImage?.name || "изображение"}` : `${completedPoints} из ${selectedImages.length} точек готовы` : latestResult ? "Готовый рендер" : primaryImage ? "Подготовьте исходники" : "Здесь появится результат";

  return <section className="editorial-workbench" id="workspace" aria-labelledby="editorial-workbench-title">
    <h2 className="sr-only" id="editorial-workbench-title">Рабочая область {config.templateTitle}</h2>
    <div className="editorial-workbench-grid">
      <div className="editorial-source-column">
        <section className="editorial-source-panel">
          <header><span>1.</span><div><h3>{config.primaryInputLabel}</h3><p>{config.primaryInputHelp}</p></div></header>
          <div className="editorial-primary-upload">
            {primaryImage ? <img src={primaryImage.dataUrl} alt="Основное изображение" /> : <div><span>ROOM DESIGN</span><small>Исходное изображение</small></div>}
            <label><input type="file" accept={primarySlot?.acceptedMimeTypes.join(",")} onChange={(event) => void uploadPrimary(event)} /><span>{primaryImage ? "Заменить изображение" : "Загрузить изображение"}</span><small>{primaryImage?.name || "JPG, PNG или WEBP"}</small></label>
          </div>
        </section>

        <section className="editorial-source-panel">
          <header><span>2.</span><div><h3>{config.additionalInputsLabel} <b>({selectedImages.length}/{maxSlots})</b></h3><p>{config.additionalInputsHelp}</p></div></header>
          <div className="editorial-active-slots">
            {Array.from({ length: maxSlots }, (_, index) => {
              const image = activeImages[index];
              const state = slotStates[index];
              const draggedImage = sourceHistory.find((item) => item.id === draggedAssetId);
              return <article key={index} className={`${image ? "is-filled" : "is-empty"}${image && placingId === image.id ? " is-placing" : ""}${state === "error" ? " is-error" : ""}${draggedAssetId && canDropHistoryAt(draggedImage, index) ? " is-drop-ready" : ""}${dropTargetIndex === index ? " is-drop-active" : ""}`} onDragOver={(event) => allowHistoryDrop(event, index)} onDragLeave={() => setDropTargetIndex(null)} onDrop={(event) => dropHistoryAsset(event, index)}>
                <span className="editorial-slot-number">{String(index + 1).padStart(2, "0")}</span>
                {image ? <>
                  <button type="button" className="editorial-slot-preview" onClick={() => selectPlacement(image)} aria-label={`Указать точку для ${image.name}`}><img src={image.dataUrl} alt="" /></button>
                  <button type="button" className="editorial-slot-remove" onClick={() => removeActive(index)} aria-label={`Убрать ${image.name} из активного набора`}>×</button>
                  <label className="editorial-slot-replace"><input type="file" accept={additionalSlot?.acceptedMimeTypes.join(",")} onChange={(event) => void uploadAdditional(index, event)} />Заменить</label>
                  <small>{placements[image.id] ? "Точка задана" : "Указать точку"}</small>
                </> : <label className="editorial-slot-add">
                  <input type="file" accept={additionalSlot?.acceptedMimeTypes.join(",")} onChange={(event) => void uploadAdditional(index, event)} disabled={state === "uploading"} />
                  <b>{state === "uploading" ? "…" : "+"}</b><small>{state === "uploading" ? "Загрузка" : state === "error" ? "Повторить" : "Добавить"}</small>
                </label>}
              </article>;
            })}
          </div>
          <button className="editorial-create-button" type="button" disabled={!ready} onClick={() => void runGeneration()}>{phase === "processing" ? "Создаём единый рендер…" : "Создать рендер"}<span>→</span></button>
          {authChecked && !user && <p className="editorial-workbench-note">Для сохранения истории и генерации нужен вход. <Link href="/#кабинет">Войти →</Link></p>}
          {user && !generationConfigured && <p className="editorial-workbench-note">Генерация временно недоступна.</p>}
          {error && <p className="editorial-workbench-error" role="alert">{error}</p>}
        </section>
      </div>

      <section className="editorial-result-panel" aria-label="Результат">
        <header><p>РЕЗУЛЬТАТ{latestResult && !showDraft ? " / ГОТОВЫЙ РЕНДЕР" : ""}</p><span>GOOD ROOMS<br />BETTER LIVES</span></header>
        <div className={`editorial-result-stage${placingId && showDraft ? " is-placing" : ""}${latestResult && !showDraft ? " has-result" : ""}`}>
          {stageImage ? <button type="button" onClick={handleStageClick} aria-label={placingId && showDraft ? `Указать точку для ${activeImage?.name || "изображения"}` : latestResult && !showDraft ? "Открыть готовый рендер" : "Основное изображение"}>
            <img src={stageImage} alt={latestResult && !showDraft ? "Готовый рендер" : "Основное изображение"} />
            {showDraft && Object.entries(placements).map(([id, point]) => {
              const index = activeIds.indexOf(id);
              return index >= 0 ? <span className="editorial-placement-point" key={id} style={{ left: `${point.x}%`, top: `${point.y}%` }}>{index + 1}</span> : null;
            })}
          </button> : <div className="editorial-result-empty"><b>ROOM DESIGN</b><p>Загрузите основное и дополнительные изображения — здесь появится результат.</p></div>}
          {phase === "processing" && <div className="editorial-result-progress" role="status"><i /><b>Создаём единый рендер · {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</b><p>Все выбранные изображения обрабатываются в одном результате.</p></div>}
          {phase === "failed" && <div className="editorial-result-error" role="alert"><b>Рендер не создан</b><p>{error || "Попробуйте запустить генерацию ещё раз."}</p></div>}
        </div>
        <footer><h3>{resultTitle}</h3>{primaryImage && selectedImages.length > 0 && showDraft && <span>{completedPoints} / {selectedImages.length} точек</span>}</footer>
      </section>
    </div>

    <div className="editorial-histories">
      <HistoryRail id="source-history-title" title="История предметов" description={activeIds.includes(null) ? "Перетащите предмет в свободный слот или нажмите «Использовать»." : "Удалите одно из активных изображений, чтобы добавить другое."} count={sourceHistory.length} empty="Загруженные дополнительные изображения появятся здесь.">
        {sourceHistory.map((image) => {
          const selected = activeIds.includes(image.id);
          const full = !activeIds.includes(null);
          return <article className={`${selected ? "is-selected" : ""}${draggedAssetId === image.id ? " is-dragging" : ""}`} key={image.id} draggable={!selected && !full} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-room-design-asset", image.id); setDraggedAssetId(image.id); }} onDragEnd={() => { setDraggedAssetId(""); setDropTargetIndex(null); }} title={selected ? "Уже добавлен" : full ? "Освободите слот" : "Перетащите в свободный слот"}>
            <img src={image.dataUrl} alt="" draggable={false} />
            <div><b>{image.name}</b><small>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(image.createdAt))}</small></div>
            <button type="button" onClick={() => addFromHistory(image)} disabled={selected || full}>{selected ? "Активно" : full ? "Нет места" : "Использовать"}</button>
          </article>;
        })}
      </HistoryRail>
      <HistoryRail id="generation-history-title" title="История генераций" description="Ваши предыдущие результаты." count={generationHistory.length} empty="После первой генерации здесь появятся сохранённые варианты.">
        {generationHistory.map((item, index) => <button className="editorial-generation-card" type="button" key={item.id} onClick={() => setLightbox(item)}>
          <img src={item.dataUrl} alt={`Рендер ${generationHistory.length - index}`} />
          <span><b>Рендер {String(generationHistory.length - index).padStart(2, "0")}</b><small>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</small></span>
        </button>)}
      </HistoryRail>
    </div>

    {lightbox && <div className="editorial-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр готового рендера">
      <button className="editorial-lightbox-download" type="button" onClick={() => void downloadImageAsJpeg(lightbox.dataUrl, `room-design-${template.slug}-${lightbox.id}`).catch(() => setError("Не удалось скачать изображение. Попробуйте ещё раз."))} aria-label="Скачать готовый рендер в JPEG" title="Скачать JPEG"><span className="history-download-icon" aria-hidden="true"><i /></span></button>
      <button className="editorial-lightbox-close" type="button" aria-label="Закрыть полноэкранный просмотр" onClick={() => setLightbox(null)}>×</button>
      <img src={lightbox.dataUrl} alt={lightbox.name} />
    </div>}
  </section>;
}
