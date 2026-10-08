"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- horizontal histories are keyboard-scrollable */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type WheelEvent } from "react";

import { getTemplateWorkbenchScenario } from "@/lib/templates/workbench";
import type { TemplateDefinition, TemplateInputSlot } from "@/lib/templates/types";

type UploadedFile = { id: string; name: string; type: string; size: number; dataUrl: string; sourceUrl?: string; createdAt: string };
type GenerationItem = { id: string; batchId: string; label: string; dataUrl: string; createdAt: string };
type LightboxState = { items: GenerationItem[]; index: number };
type User = { id: string; email: string };
type Phase = "idle" | "processing" | "failed";

const isValueSlot = (slot: TemplateInputSlot) => slot.kind === "choice" || slot.kind === "short_text" || slot.kind === "range";
const isImage = (file: UploadedFile) => file.type.startsWith("image/");
const imageTypeByExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const normalizedFileType = (file: Pick<File, "name" | "type">) => {
  const type = file.type.toLowerCase();
  if (type === "image/jpg" || type === "image/pjpeg") return "image/jpeg";
  if (type) return type;
  return imageTypeByExtension[file.name.split(".").pop()?.toLowerCase() || ""] || "";
};
const acceptedFileTypes = (slot: TemplateInputSlot) => [
  ...slot.acceptedMimeTypes,
  ...(slot.acceptedMimeTypes.includes("image/jpeg") ? [".jpg", ".jpeg"] : []),
  ...(slot.acceptedMimeTypes.includes("image/png") ? [".png"] : []),
  ...(slot.acceptedMimeTypes.includes("image/webp") ? [".webp"] : []),
].join(",");

const hasGeometryLockConflict = (value: string) => {
  if (!value.trim()) return false;
  const action = "(?:добав(?:ить|ь|ьте)|созда(?:ть|й|йте)|перенес(?:ти|и|ите)|передвин(?:уть|ь|ьте)|перестав(?:ить|ь|ьте)|удал(?:ить|и|ите)|убер(?:ите|и)|измен(?:ить|и|ите)|увелич(?:ить|ь|ьте)|уменьш(?:ить|ь|ьте)|расшир(?:ить|ь|ьте)|замен(?:ить|и|ите))";
  const structure = "(?:остров|шкаф|модул|столешниц|стен|окн|двер|проём|планиров|архитектур|геометри)";
  const newStructure = "(?:нов(?:ый|ая|ое|ую)|дополнительн(?:ый|ая|ое|ую))";
  return new RegExp(`${action}[^\\n]{0,70}${structure}|${newStructure}[^\\n]{0,50}${structure}`, "i").test(value);
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Не удалось подготовить файл."));
  reader.readAsDataURL(blob);
});

const readFile = (file: File, maxDimension = 1800) => new Promise<UploadedFile>((resolve, reject) => {
  const fileType = normalizedFileType(file);
  const reader = new FileReader();
  reader.onload = () => {
    const rawDataUrl = String(reader.result || "");
    const dataUrl = fileType && rawDataUrl.startsWith("data:") ? rawDataUrl.replace(/^data:[^;,]*/, `data:${fileType}`) : rawDataUrl;
    if (!fileType.startsWith("image/")) {
      resolve({ id: crypto.randomUUID(), name: file.name, type: fileType, size: file.size, dataUrl, createdAt: new Date().toISOString() });
      return;
    }
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale === 1) {
        resolve({ id: crypto.randomUUID(), name: file.name, type: fileType, size: file.size, dataUrl, createdAt: new Date().toISOString() });
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Не удалось подготовить изображение."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL("image/webp", 0.9);
      resolve({ id: crypto.randomUUID(), name: file.name, type: "image/webp", size: Math.round(compressed.length * 0.75), dataUrl: compressed, createdAt: new Date().toISOString() });
    };
    image.onerror = () => reject(new Error(`${file.name}: не удалось прочитать изображение.`));
    image.src = dataUrl;
  };
  reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
  reader.readAsDataURL(file);
});

const resolveDataUrl = async (file: UploadedFile) => file.dataUrl.startsWith("data:") ? file.dataUrl : blobToDataUrl(await fetch(file.sourceUrl || file.dataUrl).then((response) => {
  if (!response.ok) throw new Error(`Не удалось открыть «${file.name}».`);
  return response.blob();
}));

const validateFile = (slot: TemplateInputSlot, file: File) => {
  const fileType = normalizedFileType(file);
  if (slot.acceptedMimeTypes.length && !slot.acceptedMimeTypes.includes(fileType)) throw new Error(`${file.name}: неподдерживаемый формат. Используйте JPG, PNG или WEBP.`);
  if (slot.maxBytes && file.size > slot.maxBytes) throw new Error(`${file.name}: файл превышает допустимый размер.`);
};

async function persistImage(templateId: string, file: UploadedFile) {
  const response = await fetch("/api/account/template-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId, name: file.name, dataUrl: file.dataUrl, clientId: file.id }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить материал в истории.");
  return { ...file, ...payload.asset, dataUrl: file.dataUrl, sourceUrl: payload.asset.sourceUrl } as UploadedFile;
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
  const move = (direction: -1 | 1) => viewportRef.current?.scrollBy({ left: direction * Math.max(260, viewportRef.current.clientWidth * 0.72), behavior: "smooth" });
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || !event.deltaY) return;
    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  };
  return <section className="editorial-history" aria-labelledby={id}>
    <header><div><h2 id={id}>{title}</h2><p>{description}</p></div><nav aria-label={`Прокрутка: ${title}`}><button type="button" onClick={() => move(-1)} disabled={!canBack}>←</button><button type="button" onClick={() => move(1)} disabled={!canForward}>→</button></nav></header>
    {count ? <div className="editorial-history-viewport" ref={viewportRef} onWheel={handleWheel} onKeyDown={(event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }} tabIndex={0} role="region" aria-label={title}>{children}</div> : <p className="editorial-history-empty">{empty}</p>}
  </section>;
}

function FileCard({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  return <article className="editorial-dynamic-file">
    {isImage(file) ? <img src={file.dataUrl} alt="" /> : <div><b>{file.type.startsWith("audio/") ? "AUDIO" : file.type.startsWith("video/") ? "VIDEO" : "FILE"}</b></div>}
    <span>{file.name}</span><button type="button" onClick={onRemove} aria-label={`Убрать ${file.name}`}>×</button>
  </article>;
}

function RangeControl({ slot, value, onChange }: { slot: TemplateInputSlot; value: string; onChange: (value: string) => void }) {
  const range = slot.range;
  if (!range) return null;
  const displayValue = value ? Number(value) : range.defaultValue;
  const selectedPreset = range.presets.find((preset) => preset.value === displayValue);
  return <div className={`editorial-range-control${value ? " is-selected" : ""}`}>
    <div className="editorial-range-value"><b>{displayValue}</b><span>{range.unit}</span><small>{value ? selectedPreset?.label || "Пользовательское значение" : "Передвиньте ползунок или выберите пресет"}</small></div>
    <input type="range" min={range.min} max={range.max} step={range.step} value={displayValue} aria-label={`${slot.label}, ${displayValue} ${range.unit}`} onChange={(event) => onChange(event.target.value)} />
    <div className="editorial-range-scale" aria-hidden="true"><span>{range.min} {range.unit}</span><span>{range.max} {range.unit}</span></div>
    <div className="editorial-range-presets" role="group" aria-label="Быстрые пресеты температуры света">
      {range.presets.map((preset) => <button type="button" key={preset.value} aria-pressed={value === String(preset.value)} onClick={() => onChange(String(preset.value))}><b>{preset.value} {range.unit}</b><span>{preset.label}</span><small>{preset.description}</small></button>)}
    </div>
  </div>;
}

const generationCount = (template: TemplateDefinition, outputLabels: string[], uploads: Record<string, UploadedFile[]>) => {
  if (["wall-color", "floor-preview", "object-replacement"].includes(template.slug)) {
    const references = template.inputSlots.slice(1).reduce((count, slot) => count + (uploads[slot.id]?.length || 0), 0);
    return Math.max(1, Math.min(outputLabels.length, references));
  }
  if (template.slug === "cover-home") return Math.max(1, Math.min(outputLabels.length, uploads.room?.length || 1));
  return outputLabels.length;
};

export default function TemplateScenarioWorkbench({ template }: { template: TemplateDefinition }) {
  const scenario = useMemo(() => getTemplateWorkbenchScenario(template), [template]);
  const fileSlots = useMemo(() => template.inputSlots.filter((slot) => !isValueSlot(slot)), [template]);
  const primarySlot = fileSlots[0];
  const [uploads, setUploads] = useState<Record<string, UploadedFile[]>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [assetHistory, setAssetHistory] = useState<UploadedFile[]>([]);
  const [generationHistory, setGenerationHistory] = useState<GenerationItem[]>([]);
  const [latestResults, setLatestResults] = useState<GenerationItem[]>([]);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [generationConfigured, setGenerationConfigured] = useState(false);
  const [draggedAssetId, setDraggedAssetId] = useState("");
  const [dropTargetSlotId, setDropTargetSlotId] = useState("");

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
      const [assetsResponse, generationsResponse] = await Promise.all([
        fetch("/api/account/template-assets"),
        fetch("/api/account/generations"),
      ]);
      const assetsPayload = await assetsResponse.json().catch(() => ({ assets: [] }));
      const generationsPayload = await generationsResponse.json().catch(() => ({ generations: [] }));
      if (!active) return;
      if (assetsResponse.ok) setAssetHistory((assetsPayload.assets || []).map((asset: UploadedFile & { contentType: string; sourceUrl: string }) => ({ ...asset, type: asset.contentType, dataUrl: asset.sourceUrl })));
      if (generationsResponse.ok) {
        const prefix = `[template:${template.slug};`;
        const stored = (generationsPayload.generations || [])
          .filter((generation: { operation?: string; prompt?: string }) => generation.operation === "global_edit" && generation.prompt?.startsWith(prefix))
          .map((generation: { id: string; created_at: string; prompt: string }) => ({
            id: generation.id,
            batchId: generation.prompt.match(/batch:([^;\]]+)/)?.[1]?.trim() || `legacy:${generation.created_at.slice(0, 16)}`,
            label: generation.prompt.match(/output:([^\]]+)/)?.[1]?.trim() || scenario.resultTitle,
            dataUrl: `/api/account/generations/${generation.id}`,
            createdAt: generation.created_at,
          }));
        setGenerationHistory(stored);
      }
    };
    void load().catch(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, [scenario.resultTitle, template.slug]);

  useEffect(() => {
    if (phase !== "processing") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!lightbox) return;
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
      if (event.key === "ArrowLeft") setLightbox((current) => current ? { ...current, index: Math.max(0, current.index - 1) } : null);
      if (event.key === "ArrowRight") setLightbox((current) => current ? { ...current, index: Math.min(current.items.length - 1, current.index + 1) } : null);
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [lightbox]);

  const openLightbox = (items: GenerationItem[], id: string) => {
    const ordered = [...items].sort((left, right) => {
      const leftIndex = scenario.outputLabels.indexOf(left.label);
      const rightIndex = scenario.outputLabels.indexOf(right.label);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    });
    setLightbox({ items: ordered, index: Math.max(0, ordered.findIndex((item) => item.id === id)) });
  };

  const validationErrors = useMemo(() => {
    const issues: string[] = [];
    for (const slot of template.inputSlots) {
      if (isValueSlot(slot)) {
        if (slot.required && !values[slot.id]?.trim()) issues.push(`${slot.label}: заполните поле.`);
        continue;
      }
      const count = uploads[slot.id]?.length || 0;
      if (slot.required && count < slot.minCount) issues.push(`${slot.label}: добавьте ${slot.minCount === 1 ? "файл" : `минимум ${slot.minCount} файла`}.`);
      if (count > slot.maxCount) issues.push(`${slot.label}: максимум ${slot.maxCount}.`);
      if (count && slot.consent && slot.consent !== "none" && !consents[slot.id]) issues.push(`${slot.label}: подтвердите согласие.`);
    }
    for (const group of template.requireAnyOf || []) {
      if (!group.some((id) => Boolean(values[id]?.trim()) || Boolean(uploads[id]?.length))) {
        const labels = group.map((id) => template.inputSlots.find((slot) => slot.id === id)?.label.toLowerCase()).filter(Boolean);
        issues.push(labels.length ? `${labels.join(" или ")}: выберите один вариант.` : "Добавьте хотя бы один из предложенных материалов.");
      }
    }
    const primary = uploads[primarySlot?.id]?.[0];
    if (primary && !isImage(primary)) issues.push("Для запуска генерации первым материалом должно быть изображение.");
    if (template.safetyPolicy === "geometry-lock" && hasGeometryLockConflict(values.additionalPrompt || "")) {
      issues.push("Дополнительный prompt просит изменить геометрию кухни. В режиме Geometry Lock можно менять только окружение, свет и визуальную подачу.");
    }
    return issues;
  }, [consents, primarySlot?.id, template.inputSlots, template.requireAnyOf, template.safetyPolicy, uploads, values]);

  const ready = validationErrors.length === 0 && Boolean(user) && generationConfigured && phase !== "processing";
  const primaryFiles = uploads[primarySlot?.id] || [];
  const stageImage = latestResults[0]?.dataUrl || primaryFiles.find(isImage)?.dataUrl;

  const setInputValue = (slotId: string, value: string) => {
    setValues((current) => {
      const next = { ...current, [slotId]: value };
      for (const group of template.exclusiveValueGroups || []) {
        if (!group.includes(slotId)) continue;
        for (const otherId of group) if (otherId !== slotId) delete next[otherId];
      }
      return next;
    });
    setLatestResults([]);
    setError("");
  };

  const uploadFiles = async (slot: TemplateInputSlot, event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []);
    event.target.value = "";
    if (!incoming.length) return;
    setError("");
    try {
      incoming.forEach((file) => validateFile(slot, file));
      const remaining = Math.max(0, slot.maxCount - (uploads[slot.id]?.length || 0));
      if (!remaining) throw new Error(`${slot.label}: достигнут максимум ${slot.maxCount}.`);
      const localFiles = await Promise.all(incoming.slice(0, remaining).map((file) => readFile(file)));
      const keepInMaterialHistory = slot.id !== primarySlot?.id || primarySlot?.kind !== "room_image";
      const savedFiles = await Promise.all(localFiles.map(async (file) => user && isImage(file) && keepInMaterialHistory ? persistImage(template.slug, file) : file));
      setUploads((current) => ({ ...current, [slot.id]: [...(current[slot.id] || []), ...savedFiles].slice(0, slot.maxCount) }));
      if (keepInMaterialHistory) setAssetHistory((current) => [...savedFiles.filter(isImage), ...current.filter((item) => !savedFiles.some((file) => file.id === item.id))]);
      setLatestResults([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить файл.");
    }
  };

  const removeFile = (slotId: string, id: string) => {
    setUploads((current) => ({ ...current, [slotId]: (current[slotId] || []).filter((file) => file.id !== id) }));
    setLatestResults([]);
    setError("");
  };

  const addFromHistory = (file: UploadedFile) => {
    const compatible = [...fileSlots.slice(1), ...fileSlots.slice(0, 1)].find((slot) => slot.acceptedMimeTypes.includes(file.type) && (uploads[slot.id]?.length || 0) < slot.maxCount && !(uploads[slot.id] || []).some((item) => item.id === file.id));
    if (!compatible) return setError("Освободите подходящий слот, чтобы использовать этот материал снова.");
    addHistoryToSlot(file, compatible);
  };

  const canAddHistoryToSlot = (file: UploadedFile | undefined, slot: TemplateInputSlot) => Boolean(file && slot.acceptedMimeTypes.includes(file.type) && (uploads[slot.id]?.length || 0) < slot.maxCount && !(uploads[slot.id] || []).some((item) => item.id === file.id));

  const addHistoryToSlot = (file: UploadedFile, slot: TemplateInputSlot) => {
    if (!canAddHistoryToSlot(file, slot)) return setError(`${slot.label}: материал нельзя добавить в этот слот.`);
    setUploads((current) => ({ ...current, [slot.id]: [...(current[slot.id] || []), file] }));
    setLatestResults([]);
    setError("");
  };

  const droppedHistoryAsset = (event: DragEvent<HTMLElement>) => assetHistory.find((file) => file.id === event.dataTransfer.getData("application/x-room-design-asset") || file.id === draggedAssetId);

  const allowHistoryDrop = (event: DragEvent<HTMLElement>, slot: TemplateInputSlot) => {
    const file = assetHistory.find((item) => item.id === draggedAssetId);
    if (!canAddHistoryToSlot(file, slot)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropTargetSlotId(slot.id);
  };

  const dropHistoryAsset = (event: DragEvent<HTMLElement>, slot: TemplateInputSlot) => {
    event.preventDefault();
    const file = droppedHistoryAsset(event);
    if (file) addHistoryToSlot(file, slot);
    setDraggedAssetId("");
    setDropTargetSlotId("");
  };

  const runGeneration = async () => {
    if (!ready) return setError(validationErrors[0] || (!user ? "Войдите в Room Design, чтобы запустить сценарий." : "Проверьте исходные материалы."));
    const primary = primaryFiles.find(isImage);
    if (!primary) return setError("Добавьте основное изображение.");
    setError("");
    setElapsedSeconds(0);
    setPhase("processing");
    try {
      const primaryDataUrl = await resolveDataUrl(primary);
      const allImages = Object.values(uploads).flat().filter((file) => file.id !== primary.id && isImage(file));
      const referenceImages = await Promise.all(allImages.slice(0, 10).map(resolveDataUrl));
      const fieldBrief = template.inputSlots.map((slot) => {
        if (isValueSlot(slot)) return values[slot.id]?.trim() ? `${slot.label}: ${values[slot.id].trim()}` : "";
        const files = uploads[slot.id] || [];
        return files.length ? `${slot.label}: ${files.map((file) => file.name).join(", ")}` : "";
      }).filter(Boolean).join("\n");
      const count = generationCount(template, scenario.outputLabels, uploads);
      const labels = scenario.outputLabels.slice(0, count);
      const batchId = crypto.randomUUID();
      const generated = await Promise.all(labels.map(async (label) => {
        const operationId = crypto.randomUUID();
        const historyMarker = `[template:${template.slug}; batch:${batchId}; output:${label}]`;
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
          body: JSON.stringify({
            operation: "global_edit",
            prompt: `${historyMarker} ${scenario.generationBrief}`,
            roomImage: primaryDataUrl,
            templateEdit: {
              templateId: template.slug,
              outputLabel: label,
              referenceImages,
              instructions: `${scenario.generationBrief}\n${fieldBrief}\nCreate only the result «${label}».`,
            },
            outputSize: "1536x1024",
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Не удалось создать «${label}».`);
        }
        return { id: operationId, batchId, label, dataUrl: await blobToDataUrl(await response.blob()), createdAt: new Date().toISOString() } satisfies GenerationItem;
      }));
      setLatestResults(generated);
      setGenerationHistory((current) => [...generated, ...current.filter((item) => !generated.some((result) => result.id === item.id))]);
      setPhase("idle");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Генерация не завершилась.");
      setPhase("failed");
    }
  };

  return <section className="editorial-workbench editorial-scenario-workbench" id="workspace" aria-labelledby="scenario-workbench-title">
    <h2 className="sr-only" id="scenario-workbench-title">Рабочая область {template.title}</h2>
    <div className="editorial-workbench-grid">
      <div className="editorial-source-column">
        {template.safetyPolicy === "geometry-lock" && <aside className="editorial-geometry-lock" aria-label="Ограничения Geometry Lock">
          <span>GEOMETRY LOCK · ВКЛЮЧЁН</span>
          <h3>Проект кухни остаётся неизменным</h3>
          <p>Фиксируем камеру, модули, фасады, столешницу, ручки и расположение техники. Меняются только материалы, свет, окружение и качество изображения.</p>
          <small>PREVIEW · назначение поверхностей подтверждается вручную</small>
        </aside>}
        {template.inputSlots.map((slot, index) => <section className="editorial-source-panel editorial-dynamic-panel" key={slot.id}>
          <header><span>{index + 1}.</span><div><h3>{slot.label}{!isValueSlot(slot) && <b> ({uploads[slot.id]?.length || 0}/{slot.maxCount})</b>}</h3><p>{slot.helper || (slot.required ? "Обязательный материал" : "Необязательно")}</p></div></header>
          {isValueSlot(slot) ? slot.kind === "choice" ? <div className="editorial-choice-grid">{slot.options?.map((option) => <button className={values[slot.id] === option ? "is-selected" : ""} aria-pressed={values[slot.id] === option} type="button" key={option} onClick={() => setInputValue(slot.id, option)}>{option}</button>)}</div> : slot.kind === "range" ? <RangeControl slot={slot} value={values[slot.id] || ""} onChange={(value) => setInputValue(slot.id, value)} /> : <textarea className="editorial-text-input" value={values[slot.id] || ""} placeholder={slot.placeholder} onChange={(event) => setInputValue(slot.id, event.target.value)} /> : <>
            <div className={`editorial-dynamic-files${slot.id === primarySlot?.id ? " is-primary" : ""}${draggedAssetId && canAddHistoryToSlot(assetHistory.find((file) => file.id === draggedAssetId), slot) ? " is-drop-ready" : ""}${dropTargetSlotId === slot.id ? " is-drop-active" : ""}`} onDragOver={(event) => allowHistoryDrop(event, slot)} onDragLeave={() => setDropTargetSlotId("")} onDrop={(event) => dropHistoryAsset(event, slot)}>
              {(uploads[slot.id] || []).map((file) => <FileCard key={file.id} file={file} onRemove={() => removeFile(slot.id, file.id)} />)}
              {(uploads[slot.id]?.length || 0) < slot.maxCount && <label className="editorial-dynamic-add"><input type="file" multiple={slot.maxCount > 1} accept={acceptedFileTypes(slot)} aria-label={slot.label} onChange={(event) => void uploadFiles(slot, event)} /><b>+</b><span>{uploads[slot.id]?.length ? "Добавить ещё" : "Добавить файл"}</span></label>}
            </div>
            {slot.consent && slot.consent !== "none" && Boolean(uploads[slot.id]?.length) && <label className="editorial-consent"><input type="checkbox" checked={Boolean(consents[slot.id])} onChange={(event) => setConsents((current) => ({ ...current, [slot.id]: event.target.checked }))} /><span>{slot.consent === "people" ? "У меня есть согласие людей на использование фотографий" : slot.consent === "audio" ? "У меня есть право использовать этот аудиофрагмент" : "Владелец материала подтвердил участие"}</span></label>}
          </>}
        </section>)}
        <button className="editorial-create-button" type="button" disabled={!ready} onClick={() => void runGeneration()}>{phase === "processing" ? "Создаём результат…" : scenario.actionLabel}<span>→</span></button>
        {authChecked && !user && <p className="editorial-workbench-note">Для генерации и сохранения истории нужен вход. <Link href="/#кабинет">Войти →</Link></p>}
        {user && !generationConfigured && <p className="editorial-workbench-note">Генерация временно недоступна.</p>}
        {scenario.videoPreview && <p className="editorial-workbench-note">Сейчас создаётся ключевой кадр для проверки сценария. Финальный video pipeline ещё не подключён.</p>}
        {error && <p className="editorial-workbench-error" role="alert">{error}</p>}
      </div>

      <section className="editorial-result-panel" aria-label="Результат">
        <header><p>РЕЗУЛЬТАТ</p><span>GOOD ROOMS<br />BETTER LIVES</span></header>
        <div className={`editorial-result-stage${latestResults.length ? " has-result" : ""}`}>
          {latestResults.length > 1 ? <div className={`editorial-result-collection count-${Math.min(latestResults.length, 4)}`}>{latestResults.map((item) => <button type="button" key={item.id} onClick={() => openLightbox(latestResults, item.id)}><img src={item.dataUrl} alt={item.label} /><span>{item.label}</span></button>)}</div> : stageImage ? <button type="button" onClick={() => latestResults[0] && openLightbox(latestResults, latestResults[0].id)} aria-label={latestResults[0] ? "Открыть результат" : "Основное изображение"}><img src={stageImage} alt={latestResults[0]?.label || "Основное изображение"} /></button> : <div className="editorial-result-empty"><b>ROOM DESIGN</b><p>Добавьте исходные материалы — здесь появится результат сценария.</p></div>}
          {phase === "processing" && <div className="editorial-result-progress" role="status"><i /><b>Создаём {scenario.outputLabels.length > 1 ? "варианты" : "результат"} · {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</b><p>Все варианты создаются из одного набора исходных материалов.</p></div>}
          {phase === "failed" && <div className="editorial-result-error" role="alert"><b>Результат не создан</b><p>{error || "Попробуйте запустить сценарий ещё раз."}</p></div>}
        </div>
        <footer><h3>{latestResults.length ? scenario.resultTitle : primaryFiles.length ? "Исходники готовы" : "Здесь появится результат"}</h3>{latestResults.length > 1 && <span>{latestResults.length} варианта</span>}</footer>
      </section>
    </div>

    <div className="editorial-histories">
      <HistoryRail id="asset-history-title" title="История материалов" description="Перетащите материал в нужное поле или нажмите «Использовать»." count={assetHistory.length} empty="Загруженные изображения появятся здесь.">
        {assetHistory.map((file) => <article className={draggedAssetId === file.id ? "is-dragging" : ""} key={file.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-room-design-asset", file.id); setDraggedAssetId(file.id); }} onDragEnd={() => { setDraggedAssetId(""); setDropTargetSlotId(""); }} title="Перетащите в нужное поле"><img src={file.dataUrl} alt="" draggable={false} /><div><b>{file.name}</b><small>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(file.createdAt))}</small></div><button type="button" onClick={() => addFromHistory(file)}>Использовать</button></article>)}
      </HistoryRail>
      <HistoryRail id="scenario-generation-history-title" title="История генераций" description={`Предыдущие результаты «${template.title}».`} count={generationHistory.length} empty="После первой генерации здесь появятся сохранённые результаты.">
        {generationHistory.map((item) => <button className="editorial-generation-card" type="button" key={item.id} onClick={() => openLightbox(generationHistory.filter((entry) => entry.batchId === item.batchId), item.id)}><img src={item.dataUrl} alt={item.label} /><span><b>{item.label}</b><small>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</small></span></button>)}
      </HistoryRail>
    </div>

    {lightbox && <div className="editorial-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр результатов">
      <a className="editorial-lightbox-download" href={lightbox.items[lightbox.index].dataUrl} download={`room-design-${template.slug}-${lightbox.items[lightbox.index].id}.webp`} aria-label="Скачать выбранный результат" title="Скачать"><span className="history-download-icon" aria-hidden="true"><i /></span></a>
      <button className="editorial-lightbox-close" type="button" aria-label="Закрыть" onClick={() => setLightbox(null)}>×</button>
      {lightbox.items.length > 1 && <button className="editorial-lightbox-nav is-previous" type="button" aria-label="Предыдущий результат" disabled={lightbox.index === 0} onClick={() => setLightbox((current) => current ? { ...current, index: Math.max(0, current.index - 1) } : null)}>←</button>}
      <img src={lightbox.items[lightbox.index].dataUrl} alt={lightbox.items[lightbox.index].label} />
      {lightbox.items.length > 1 && <button className="editorial-lightbox-nav is-next" type="button" aria-label="Следующий результат" disabled={lightbox.index === lightbox.items.length - 1} onClick={() => setLightbox((current) => current ? { ...current, index: Math.min(current.items.length - 1, current.index + 1) } : null)}>→</button>}
      <p className="editorial-lightbox-caption"><b>{lightbox.items[lightbox.index].label}</b>{lightbox.items.length > 1 && <span>{lightbox.index + 1} / {lightbox.items.length}</span>}</p>
    </div>}
  </section>;
}
