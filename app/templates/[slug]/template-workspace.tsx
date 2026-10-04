"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from "react";

import { resultLabels, statusLabels } from "@/lib/templates/registry";
import type { TemplateDefinition, TemplateInputSlot } from "@/lib/templates/types";

type UploadedInput = { id: string; name: string; type: string; size: number; dataUrl: string };
type GenerationMetadata = {
  model: string;
  operation: string;
  tokenCost: number | null;
  charging: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};
type GenerationResult = { id: string; name: string; dataUrl: string; fixture: boolean; metadata?: GenerationMetadata };
type Quote = { tokenCost: number; chargingEnabled: boolean };
type User = { id: string; email: string; firstName?: string; lastName?: string };
type Phase = "collecting" | "ready" | "processing" | "succeeded" | "failed";

const readFile = (file: File) => new Promise<UploadedInput>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || "") });
  reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
  reader.readAsDataURL(file);
});

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Не удалось подготовить результат."));
  reader.readAsDataURL(blob);
});

const createPointMarkerImage = (source: string, point: { x: number; y: number }) => new Promise<string>((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return reject(new Error("Не удалось подготовить выбранную точку."));
    context.drawImage(image, 0, 0);
    const x = canvas.width * point.x / 100;
    const y = canvas.height * point.y / 100;
    const radius = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
    const drawMarker = () => {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.moveTo(x - radius * 1.45, y);
      context.lineTo(x + radius * 1.45, y);
      context.moveTo(x, y - radius * 1.45);
      context.lineTo(x, y + radius * 1.45);
      context.stroke();
    };
    context.save();
    context.lineCap = "round";
    context.lineWidth = Math.max(4, radius * 0.22);
    context.strokeStyle = "#fff";
    drawMarker();
    context.lineWidth = Math.max(2, radius * 0.11);
    context.strokeStyle = "#d7193f";
    drawMarker();
    context.fillStyle = "#d7193f";
    context.beginPath();
    context.arc(x, y, Math.max(3, radius * 0.18), 0, Math.PI * 2);
    context.fill();
    context.restore();
    resolve(canvas.toDataURL("image/png"));
  };
  image.onerror = () => reject(new Error("Не удалось подготовить изображение комнаты."));
  image.src = source;
});

const fileKind = (slot: TemplateInputSlot) => !["choice", "short_text"].includes(slot.kind);

export default function TemplateWorkspace({ template }: { template: TemplateDefinition }) {
  const [uploads, setUploads] = useState<Record<string, UploadedInput[]>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>("collecting");
  const [error, setError] = useState("");
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [placement, setPlacement] = useState<{ x: number; y: number } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [generationConfigured, setGenerationConfigured] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [savedProjectId, setSavedProjectId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [meResponse, healthResponse] = await Promise.all([fetch("/api/auth/me"), fetch("/api/health")]);
      const me = await meResponse.json().catch(() => ({ user: null }));
      const health = await healthResponse.json().catch(() => ({}));
      if (!active) return;
      const nextUser = me.user || null;
      setUser(nextUser);
      setAuthChecked(true);
      setGenerationConfigured(Boolean(health.imageGeneration?.configured));
      if (nextUser) {
        const tokenResponse = await fetch("/api/account/tokens");
        const tokenPayload = await tokenResponse.json().catch(() => ({}));
        if (active && tokenResponse.ok && tokenPayload.generationQuote) setQuote(tokenPayload.generationQuote);
      }
    };
    void load().catch(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, []);

  const validationErrors = useMemo(() => {
    const issues: string[] = [];
    for (const slot of template.inputSlots) {
      if (fileKind(slot)) {
        const count = uploads[slot.id]?.length || 0;
        if (slot.required && count < slot.minCount) issues.push(`${slot.label}: добавьте ${slot.minCount === 1 ? "файл" : `минимум ${slot.minCount} файла`}.`);
        if (count > slot.maxCount) issues.push(`${slot.label}: максимум ${slot.maxCount}.`);
        if (count > 0 && slot.consent && slot.consent !== "none" && !consents[slot.id]) issues.push(`${slot.label}: подтвердите согласие.`);
      } else if (slot.required && !values[slot.id]?.trim()) {
        issues.push(`${slot.label}: заполните поле.`);
      }
    }
    for (const group of template.requireAnyOf || []) {
      const complete = group.some((id) => (uploads[id]?.length || 0) > 0 || Boolean(values[id]?.trim()));
      if (!complete) issues.push("Добавьте хотя бы один из альтернативных материалов.");
    }
    if (template.slug === "furniture-casting" && !placement) issues.push("Укажите точку размещения мебели на фотографии комнаты.");
    return issues;
  }, [consents, placement, template, uploads, values]);

  const ready = validationErrors.length === 0;
  const roomImage = uploads.room?.[0]?.dataUrl;
  const fixtureResultImage = uploads.room?.[0]?.type.startsWith("image/") ? roomImage : template.preview.src;
  const productInputs = uploads.products || [];
  const realFurnitureFlow = template.slug === "furniture-casting";
  const canRunReal = realFurnitureFlow && ready && Boolean(user) && generationConfigured;
  const totalEstimate = quote ? quote.tokenCost * Math.max(1, productInputs.length) : null;
  const realUsage = results.reduce((summary, result) => ({
    totalTokens: summary.totalTokens + (result.metadata?.totalTokens || 0),
    tokenCost: summary.tokenCost + (result.metadata?.tokenCost || 0),
  }), { totalTokens: 0, tokenCost: 0 });

  const changeInputs = async (slot: TemplateInputSlot, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    const existing = uploads[slot.id] || [];
    const remaining = Math.max(0, slot.maxCount - existing.length);
    const accepted = files.slice(0, remaining);
    for (const file of accepted) {
      if (slot.acceptedMimeTypes.length && !slot.acceptedMimeTypes.includes(file.type)) {
        setError(`${file.name}: неподдерживаемый тип файла.`);
        return;
      }
      if (slot.maxBytes && file.size > slot.maxBytes) {
        setError(`${file.name}: файл превышает допустимый размер.`);
        return;
      }
    }
    try {
      const next = await Promise.all(accepted.map(readFile));
      setUploads((current) => ({ ...current, [slot.id]: [...(current[slot.id] || []), ...next].slice(0, slot.maxCount) }));
      setPhase("collecting");
      setResults([]);
      setSavedProjectId("");
      if (slot.id === "room") setPlacement(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить файл.");
    }
  };

  const removeInput = (slotId: string, id: string) => {
    setUploads((current) => ({ ...current, [slotId]: (current[slotId] || []).filter((item) => item.id !== id) }));
    setPhase("collecting");
    setResults([]);
    setSavedProjectId("");
    if (slotId === "room") setPlacement(null);
  };

  const setPlacementFromClick = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setPlacement({ x: (event.clientX - bounds.left) * 100 / bounds.width, y: (event.clientY - bounds.top) * 100 / bounds.height });
    setPhase("collecting");
  };

  const runPreflight = () => {
    setError("");
    if (!ready) {
      setError(validationErrors[0] || "Проверьте исходные материалы.");
      return;
    }
    setPhase("ready");
  };

  const showFixtureResult = async () => {
    if (phase !== "ready") return;
    setError("");
    setPhase("processing");
    setProgress(32);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    setProgress(100);
    setResults([{ id: crypto.randomUUID(), name: `${template.title} · preview fixture`, dataUrl: fixtureResultImage || template.preview.src, fixture: true }]);
    setPhase("succeeded");
  };

  const runFurnitureGeneration = async () => {
    if (!canRunReal || !roomImage || !placement) return;
    setError("");
    setResults([]);
    setPhase("processing");
    setProgress(0);
    try {
      const generated: GenerationResult[] = [];
      let currentRoom = roomImage;
      for (let index = 0; index < productInputs.length; index += 1) {
        const product = productInputs[index];
        const markedImage = await createPointMarkerImage(currentRoom, placement);
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            operation: "place",
            prompt: "Мебельный кастинг: примерить выбранный предмет в указанной зоне, сохранив комнату и ракурс.",
            roomImage: currentRoom,
            referenceImage: product.dataUrl,
            pointEdit: { ...placement, markedImage },
            placement: { x: placement.x, y: placement.y },
            outputSize: "1536x1024",
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Не удалось создать вариант ${index + 1}.`);
        }
        const dataUrl = await blobToDataUrl(await response.blob());
        const numericHeader = (name: string) => {
          const value = response.headers.get(name);
          return value === null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
        };
        generated.push({
          id: crypto.randomUUID(),
          name: product.name,
          dataUrl,
          fixture: false,
          metadata: {
            model: response.headers.get("X-Room-AI-Model") || "не указана",
            operation: response.headers.get("X-Room-AI-Operation") || "place",
            tokenCost: numericHeader("X-Room-AI-Token-Cost"),
            charging: response.headers.get("X-Room-AI-Charging") || "unknown",
            inputTokens: numericHeader("X-Room-AI-Input-Tokens"),
            outputTokens: numericHeader("X-Room-AI-Output-Tokens"),
            totalTokens: numericHeader("X-Room-AI-Total-Tokens"),
          },
        });
        currentRoom = dataUrl;
        setResults([...generated]);
        setProgress(Math.round((index + 1) * 100 / productInputs.length));
      }
      setPhase("succeeded");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Генерация не завершилась.");
      setPhase("failed");
    }
  };

  const saveResult = async () => {
    if (!user || !roomImage || !results.length || results.some((result) => result.fixture)) return;
    setIsSaving(true);
    setError("");
    try {
      const name = `${template.title} · ${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date())}`;
      const createResponse = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, projectType: "Квартира", description: `Создано из шаблона «${template.title}», версия ${template.version}.` }) });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !created.project?.id) throw new Error(created.error || "Не удалось создать проект.");
      const historyVersions = [
        { id: crypto.randomUUID(), name: "Исходная комната", image: roomImage, generated: false },
        ...results.map((result, index) => ({ id: result.id, name: `Вариант ${index + 1}: ${result.name}`, image: result.dataUrl, generated: true })),
      ];
      const finalResult = results[results.length - 1];
      const saveResponse = await fetch(`/api/projects/${created.project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, projectType: "Квартира", description: `Шаблон ${template.id} · ${template.title} · v${template.version}`, state: { interiorImage: roomImage, generatedImage: finalResult.dataUrl, interiorName: "Исходная комната", canvasRatio: 16 / 9, generated: true, activeHistoryId: finalResult.id, historyVersions, prompt: `Template ${template.id} v${template.version}`, preserved: ["Архитектуру", "Ракурс"], creativity: "Средняя", planItems: [], planRoom: { width: 6000, length: 4500 }, planFloorReference: null, planWallReference: null, planCamera: null } }),
      });
      const saved = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(saved.error || "Не удалось сохранить результат в проект.");
      setSavedProjectId(created.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить проект.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="template-workspace" id="workspace" aria-labelledby="workspace-title">
      <header className="template-workspace-heading">
        <p className="templates-section-kicker"><b>03</b><i aria-hidden="true" /> TEMPLATE WORKSPACE</p>
        <div><h2 id="workspace-title">Добавьте своё.<br /><em>Остальное уже настроено.</em></h2><p>{template.inputSlots.length} {template.inputSlots.length === 1 ? "шаг с материалами" : "типа материалов"} · {resultLabels[template.resultType]} · {statusLabels[template.status]}</p></div>
      </header>

      <div className="template-workspace-grid">
        <div className="template-inputs">
          {template.inputSlots.map((slot, index) => {
            const slotUploads = uploads[slot.id] || [];
            if (slot.kind === "choice") return <article className="template-input-slot" key={slot.id}><span className="template-slot-number">{String(index + 1).padStart(2, "0")}</span><div className="template-slot-head"><h3>{slot.label}</h3><b>{slot.required ? "Обязательно" : "Необязательно"}</b><p>{slot.helper}</p></div><select value={values[slot.id] || ""} onChange={(event) => { setValues((current) => ({ ...current, [slot.id]: event.target.value })); setPhase("collecting"); }}><option value="">Выберите вариант</option>{slot.options?.map((option) => <option key={option}>{option}</option>)}</select></article>;
            if (slot.kind === "short_text") return <article className="template-input-slot" key={slot.id}><span className="template-slot-number">{String(index + 1).padStart(2, "0")}</span><div className="template-slot-head"><h3>{slot.label}</h3><b>{slot.required ? "Обязательно" : "Необязательно"}</b><p>{slot.helper}</p></div><textarea value={values[slot.id] || ""} placeholder={slot.placeholder} onChange={(event) => { setValues((current) => ({ ...current, [slot.id]: event.target.value })); setPhase("collecting"); }} /></article>;
            return <article className="template-input-slot" key={slot.id}>
              <span className="template-slot-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="template-slot-head"><h3>{slot.label}</h3><b>{slot.required ? "Обязательно" : "Необязательно"}</b><p>{slot.helper}</p></div>
              <label className="template-file-drop"><input type="file" multiple={slot.maxCount > 1} accept={slot.acceptedMimeTypes.join(",")} onChange={(event) => void changeInputs(slot, event)} /><i aria-hidden="true">↥</i><span><b>{slotUploads.length ? `Добавлено ${slotUploads.length} из ${slot.maxCount}` : "Выберите файлы"}</b><small>{slot.acceptedMimeTypes.map((type) => type.split("/")[1]?.toUpperCase()).join(", ")}</small></span></label>
              {slotUploads.length > 0 && <div className="template-upload-list">{slotUploads.map((file, fileIndex) => <div key={file.id}>{file.type.startsWith("image/") ? <img src={file.dataUrl} alt="" /> : <i aria-hidden="true">{file.type.startsWith("audio/") ? "♫" : "FILE"}</i>}<span><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(1)} MB · {fileIndex + 1}/{slotUploads.length}</small></span><button type="button" onClick={() => removeInput(slot.id, file.id)} aria-label={`Удалить ${file.name}`}>×</button></div>)}</div>}
              {slot.consent && slot.consent !== "none" && slotUploads.length > 0 && <label className="template-consent"><input type="checkbox" checked={Boolean(consents[slot.id])} onChange={(event) => setConsents((current) => ({ ...current, [slot.id]: event.target.checked }))} /><span>Я подтверждаю право использовать эти материалы и согласие изображённых людей.</span></label>}
            </article>;
          })}

          {realFurnitureFlow && roomImage && <article className="template-placement-slot">
            <div><span className="template-slot-number">{String(template.inputSlots.length + 1).padStart(2, "0")}</span><div className="template-slot-head"><h3>Укажите место для мебели</h3><b>Обязательно</b><p>Нажмите на центр зоны, где должен появиться каждый вариант.</p></div></div>
            <button type="button" onClick={setPlacementFromClick} aria-label="Указать точку размещения мебели"><img src={roomImage} alt="Загруженная комната" />{placement && <span style={{ left: `${placement.x}%`, top: `${placement.y}%` }}>+</span>}</button>
          </article>}
        </div>

        <aside className="template-runtime-panel">
          <div className="template-runtime-sticky">
            <p className="template-runtime-eyebrow">PREFLIGHT · V{template.version}</p>
            <h3>{template.title}</h3>
            <dl><div><dt>Результат</dt><dd>{resultLabels[template.resultType]}</dd></div><div><dt>Материалы</dt><dd>{template.inputSummary}</dd></div><div><dt>Режим</dt><dd>{canRunReal ? "Real AI" : realFurnitureFlow ? "AI недоступен" : "Preview fixture"}</dd></div></dl>
            <div className="template-capability-state">
              {canRunReal ? <><b>Реальная генерация готова</b><p>Каждый из {productInputs.length} предметов будет последовательно добавлен через текущий Room Design image edit pipeline.</p></> : realFurnitureFlow ? <><b>Реальная генерация пока недоступна</b><p>Войдите и настройте AI provider: этот шаблон не подменяет результат fixture-изображением.</p></> : <><b>{template.status === "coming_soon" ? "Pipeline ещё не подключён" : "Fixture-режим"}</b><p>Preview позволяет проверить весь UX, но не имитирует успешный AI-запуск.</p></>}
            </div>
            {validationErrors.length > 0 && <ul className="template-preflight-errors">{validationErrors.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            {phase === "collecting" && <button className="template-primary-action" type="button" onClick={runPreflight}>Проверить материалы <span>→</span></button>}
            {phase === "ready" && canRunReal && <button className="template-primary-action" type="button" onClick={() => void runFurnitureGeneration()}>{totalEstimate === null ? "Сгенерировать" : quote?.chargingEnabled ? `Сгенерировать за ~${totalEstimate} токенов` : `Сгенерировать · расчётно ${totalEstimate} токенов`} <span>→</span></button>}
            {phase === "ready" && !canRunReal && !realFurnitureFlow && <button className="template-fixture-action" type="button" onClick={() => void showFixtureResult()}>Показать preview результата <span>→</span><small>AI не запускается</small></button>}
            {phase === "ready" && quote && !quote.chargingEnabled && canRunReal && <p className="template-charging-note">Списание токенов отключено. Показана расчётная стоимость.</p>}
            {realFurnitureFlow && authChecked && !user && <p className="template-auth-note">Для реальной генерации нужен вход. <Link href="/#кабинет">Войти →</Link></p>}
            {realFurnitureFlow && user && !generationConfigured && <p className="template-auth-note">AI provider не настроен в этом preview. Генерация заблокирована, fixture-result не подставляется.</p>}
            {phase === "processing" && <div className="template-processing" role="status"><i style={{ width: `${progress}%` }} /><b>{canRunReal ? `Создаём варианты · ${progress}%` : "Собираем fixture-result…"}</b><p>{canRunReal ? "Не закрывайте страницу до завершения серии." : "AI и токены не используются."}</p></div>}
            {error && <p className="template-runtime-error" role="alert">{error}</p>}
            {phase === "failed" && <button className="template-secondary-action" type="button" onClick={() => setPhase("ready")}>Вернуться к preflight</button>}
            <p className="template-runtime-footnote">Template ID {template.id} · Version {template.version}<br />Личные файлы остаются в памяти этой вкладки до реального submit.</p>
          </div>
        </aside>
      </div>

      {phase === "succeeded" && results.length > 0 && <section className="template-result" aria-labelledby="template-result-title">
        <header><p className="templates-section-kicker"><b>04</b><i aria-hidden="true" /> RESULT</p><div><h2 id="template-result-title">{results[0].fixture ? "Preview результата." : "Ваша сцена готова."}</h2><p>{results[0].fixture ? "Это честный UX-fixture: AI не запускался, токены не списывались, изображение не менялось." : `Выполнено ${results.length} последовательных AI-вызовов. Последний результат содержит все добавленные предметы.`}</p></div></header>
        {!results[0].fixture && <dl className="template-result-metadata"><div><dt>Модель</dt><dd>{results[0].metadata?.model || "не указана"}</dd></div><div><dt>AI-вызовы</dt><dd>{results.length}</dd></div><div><dt>Provider usage</dt><dd>{realUsage.totalTokens ? `${realUsage.totalTokens} токенов` : "provider не вернул usage"}</dd></div><div><dt>Стоимость Room Design</dt><dd>{realUsage.tokenCost} токенов · {results[0].metadata?.charging === "enabled" ? "списание включено" : "расчёт без списания"}</dd></div></dl>}
        <div className="template-result-grid">{results.map((result, index) => <figure key={result.id} className={result.fixture ? "is-fixture" : ""}><div><img src={result.dataUrl} alt={result.fixture ? "Preview fixture результата" : `AI-шаг ${index + 1}`} /><span>{result.fixture ? "PREVIEW RESULT · AI НЕ ЗАПУСКАЛСЯ" : index === results.length - 1 ? `FINAL AI RESULT · ШАГ ${index + 1}` : `AI STEP · ${index + 1}`}</span></div><figcaption><b>{result.name}</b>{!result.fixture && <a href={result.dataUrl} download={`room-design-${template.slug}-${index + 1}.webp`}>Скачать ↓</a>}</figcaption></figure>)}</div>
        <div className="template-result-actions">
          {!results[0].fixture && !savedProjectId && <button type="button" disabled={isSaving} onClick={() => void saveResult()}>{isSaving ? "Сохраняем…" : "Сохранить в новом проекте"}</button>}
          {savedProjectId && <Link className="template-result-primary" href="/#кабинет">Открыть проект в кабинете →</Link>}
          <button type="button" onClick={() => { setPhase("collecting"); setResults([]); setSavedProjectId(""); }}>Повторить</button>
          <Link href="/templates">Попробовать другой шаблон →</Link>
        </div>
      </section>}
    </section>
  );
}
