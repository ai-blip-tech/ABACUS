"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- horizontal histories are keyboard-scrollable */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type WheelEvent } from "react";

import { getTemplateWorkbenchScenario } from "@/lib/templates/workbench";
import type { TemplateDefinition, TemplateInputSlot } from "@/lib/templates/types";

type UploadedFile = { id: string; name: string; type: string; size: number; dataUrl: string; sourceUrl?: string; createdAt: string };
type GenerationItem = { id: string; label: string; dataUrl: string; createdAt: string };
type User = { id: string; email: string };
type Phase = "idle" | "processing" | "failed";

const isValueSlot = (slot: TemplateInputSlot) => slot.kind === "choice" || slot.kind === "short_text";
const isImage = (file: UploadedFile) => file.type.startsWith("image/");

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Не удалось подготовить файл."));
  reader.readAsDataURL(blob);
});

const readFile = (file: File, maxDimension = 1800) => new Promise<UploadedFile>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!file.type.startsWith("image/")) {
      resolve({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, dataUrl, createdAt: new Date().toISOString() });
      return;
    }
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale === 1) {
        resolve({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, dataUrl, createdAt: new Date().toISOString() });
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
  if (slot.acceptedMimeTypes.length && !slot.acceptedMimeTypes.includes(file.type)) throw new Error(`${file.name}: неподдерживаемый формат.`);
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
  const [lightbox, setLightbox] = useState<GenerationItem | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [generationConfigured, setGenerationConfigured] = useState(false);

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
        fetch(`/api/account/template-assets?templateId=${encodeURIComponent(template.slug)}`),
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
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [lightbox]);

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
      if (!group.some((id) => Boolean(values[id]?.trim()) || Boolean(uploads[id]?.length))) issues.push("Добавьте хотя бы один из предложенных материалов.");
    }
    const primary = uploads[primarySlot?.id]?.[0];
    if (primary && !isImage(primary)) issues.push("Для запуска генерации первым материалом должно быть изображение.");
    return issues;
  }, [consents, primarySlot?.id, template.inputSlots, template.requireAnyOf, uploads, values]);

  const ready = validationErrors.length === 0 && Boolean(user) && generationConfigured && phase !== "processing";
  const primaryFiles = uploads[primarySlot?.id] || [];
  const stageImage = latestResults[0]?.dataUrl || primaryFiles.find(isImage)?.dataUrl;

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
    setUploads((current) => ({ ...current, [compatible.id]: [...(current[compatible.id] || []), file] }));
    setLatestResults([]);
    setError("");
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
      const generated = await Promise.all(labels.map(async (label) => {
        const operationId = crypto.randomUUID();
        const historyMarker = `[template:${template.slug}; output:${label}]`;
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
        return { id: operationId, label, dataUrl: await blobToDataUrl(await response.blob()), createdAt: new Date().toISOString() } satisfies GenerationItem;
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
        {template.inputSlots.map((slot, index) => <section className="editorial-source-panel editorial-dynamic-panel" key={slot.id}>
          <header><span>{index + 1}.</span><div><h3>{slot.label}{!isValueSlot(slot) && <b> ({uploads[slot.id]?.length || 0}/{slot.maxCount})</b>}</h3><p>{slot.helper || (slot.required ? "Обязательный материал" : "Необязательно")}</p></div></header>
          {isValueSlot(slot) ? slot.kind === "choice" ? <div className="editorial-choice-grid">{slot.options?.map((option) => <button className={values[slot.id] === option ? "is-selected" : ""} type="button" key={option} onClick={() => { setValues((current) => ({ ...current, [slot.id]: option })); setLatestResults([]); }}>{option}</button>)}</div> : <textarea className="editorial-text-input" value={values[slot.id] || ""} placeholder={slot.placeholder} onChange={(event) => { setValues((current) => ({ ...current, [slot.id]: event.target.value })); setLatestResults([]); }} /> : <>
            <div className={`editorial-dynamic-files${slot.id === primarySlot?.id ? " is-primary" : ""}`}>
              {(uploads[slot.id] || []).map((file) => <FileCard key={file.id} file={file} onRemove={() => removeFile(slot.id, file.id)} />)}
              {(uploads[slot.id]?.length || 0) < slot.maxCount && <label className="editorial-dynamic-add"><input type="file" multiple={slot.maxCount > 1} accept={slot.acceptedMimeTypes.join(",")} onChange={(event) => void uploadFiles(slot, event)} /><b>+</b><span>{uploads[slot.id]?.length ? "Добавить ещё" : "Добавить файл"}</span></label>}
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
          {latestResults.length > 1 ? <div className={`editorial-result-collection count-${Math.min(latestResults.length, 4)}`}>{latestResults.map((item) => <button type="button" key={item.id} onClick={() => setLightbox(item)}><img src={item.dataUrl} alt={item.label} /><span>{item.label}</span></button>)}</div> : stageImage ? <button type="button" onClick={() => latestResults[0] && setLightbox(latestResults[0])} aria-label={latestResults[0] ? "Открыть результат" : "Основное изображение"}><img src={stageImage} alt={latestResults[0]?.label || "Основное изображение"} /></button> : <div className="editorial-result-empty"><b>ROOM DESIGN</b><p>Добавьте исходные материалы — здесь появится результат сценария.</p></div>}
          {phase === "processing" && <div className="editorial-result-progress" role="status"><i /><b>Создаём {scenario.outputLabels.length > 1 ? "варианты" : "результат"} · {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</b><p>Все варианты создаются из одного набора исходных материалов.</p></div>}
          {phase === "failed" && <div className="editorial-result-error" role="alert"><b>Результат не создан</b><p>{error || "Попробуйте запустить сценарий ещё раз."}</p></div>}
        </div>
        <footer><h3>{latestResults.length ? scenario.resultTitle : primaryFiles.length ? "Исходники готовы" : "Здесь появится результат"}</h3>{latestResults.length > 1 && <span>{latestResults.length} варианта</span>}</footer>
      </section>
    </div>

    <div className="editorial-histories">
      <HistoryRail id="asset-history-title" title="История материалов" description="Ранее загруженные изображения можно использовать снова." count={assetHistory.length} empty="Загруженные изображения появятся здесь.">
        {assetHistory.map((file) => <article key={file.id}><img src={file.dataUrl} alt="" /><div><b>{file.name}</b><small>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(file.createdAt))}</small></div><button type="button" onClick={() => addFromHistory(file)}>Использовать</button></article>)}
      </HistoryRail>
      <HistoryRail id="scenario-generation-history-title" title="История генераций" description={`Предыдущие результаты «${template.title}».`} count={generationHistory.length} empty="После первой генерации здесь появятся сохранённые результаты.">
        {generationHistory.map((item) => <button className="editorial-generation-card" type="button" key={item.id} onClick={() => setLightbox(item)}><img src={item.dataUrl} alt={item.label} /><span><b>{item.label}</b><small>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</small></span></button>)}
      </HistoryRail>
    </div>

    {lightbox && <div className="editorial-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр результата"><button type="button" aria-label="Закрыть" onClick={() => setLightbox(null)}>×</button><img src={lightbox.dataUrl} alt={lightbox.label} /></div>}
  </section>;
}
