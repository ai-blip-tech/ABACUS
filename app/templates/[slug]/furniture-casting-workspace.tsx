"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from "react";

import type { TemplateDefinition, TemplateInputSlot } from "@/lib/templates/types";

type UploadedInput = { id: string; name: string; type: string; size: number; dataUrl: string };
type Point = { x: number; y: number };
type HistoryItem = { id: string; name: string; dataUrl: string; createdAt: string; productCount: number };
type User = { id: string; email: string; firstName?: string; lastName?: string };
type Phase = "idle" | "processing" | "failed";

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

const createPointMarkerImage = (source: string, point: Point) => new Promise<string>((resolve, reject) => {
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
    context.strokeStyle = "#8f001d";
    drawMarker();
    context.fillStyle = "#8f001d";
    context.beginPath();
    context.arc(x, y, Math.max(3, radius * 0.18), 0, Math.PI * 2);
    context.fill();
    context.restore();
    resolve(canvas.toDataURL("image/png"));
  };
  image.onerror = () => reject(new Error("Не удалось подготовить изображение комнаты."));
  image.src = source;
});

const validateFiles = (slot: TemplateInputSlot, files: File[]) => {
  for (const file of files) {
    if (slot.acceptedMimeTypes.length && !slot.acceptedMimeTypes.includes(file.type)) throw new Error(`${file.name}: неподдерживаемый тип файла.`);
    if (slot.maxBytes && file.size > slot.maxBytes) throw new Error(`${file.name}: файл превышает допустимый размер.`);
  }
};

export default function FurnitureCastingWorkspace({ template }: { template: TemplateDefinition }) {
  const roomSlot = template.inputSlots.find((slot) => slot.id === "room")!;
  const productSlot = template.inputSlots.find((slot) => slot.id === "products")!;
  const [room, setRoom] = useState<UploadedInput | null>(null);
  const [products, setProducts] = useState<UploadedInput[]>([]);
  const [placements, setPlacements] = useState<Record<string, Point>>({});
  const [placingProductId, setPlacingProductId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [latestResult, setLatestResult] = useState<HistoryItem | null>(null);
  const [lightbox, setLightbox] = useState<HistoryItem | null>(null);
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
      if (me.user) {
        const response = await fetch("/api/account/generations");
        const payload = await response.json().catch(() => ({ generations: [] }));
        if (!active || !response.ok) return;
        const stored = (payload.generations || [])
          .filter((generation: { operation?: string; prompt?: string }) => generation.operation === "place" && generation.prompt?.startsWith("Мебельный кастинг:"))
          .map((generation: { id: string; created_at: string }) => ({ id: generation.id, name: "Мебельный кастинг", dataUrl: `/api/account/generations/${generation.id}`, createdAt: generation.created_at, productCount: 1 }));
        setHistory(stored);
        if (stored[0]) setLatestResult(stored[0]);
      }
    };
    void load().catch(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [lightbox]);

  const activeProduct = products.find((product) => product.id === placingProductId) || null;
  const missingPoint = products.find((product) => !placements[product.id]);
  const stageImage = placingProductId ? room?.dataUrl : latestResult?.dataUrl || room?.dataUrl;
  const completedPoints = useMemo(() => products.filter((product) => placements[product.id]).length, [placements, products]);

  const uploadRoom = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      validateFiles(roomSlot, [file]);
      setRoom(await readFile(file));
      setPlacements({});
      setPlacingProductId(products[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить комнату.");
    }
  };

  const uploadProducts = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    try {
      const accepted = files.slice(0, Math.max(0, productSlot.maxCount - products.length));
      validateFiles(productSlot, accepted);
      const next = await Promise.all(accepted.map(readFile));
      setProducts((current) => [...current, ...next].slice(0, productSlot.maxCount));
      if (next[0]) setPlacingProductId(next[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить мебель.");
    }
  };

  const removeProduct = (id: string) => {
    setProducts((current) => current.filter((product) => product.id !== id));
    setPlacements((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (placingProductId === id) setPlacingProductId("");
  };

  const handleStageClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!placingProductId || !room) {
      if (latestResult) setLightbox(latestResult);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) * 100 / bounds.width, y: (event.clientY - bounds.top) * 100 / bounds.height };
    setPlacements((current) => ({ ...current, [placingProductId]: point }));
    const nextProduct = products.find((product) => product.id !== placingProductId && !placements[product.id]);
    setPlacingProductId(nextProduct?.id || "");
    setError("");
  };

  const runGeneration = async () => {
    if (!room) return setError("Сначала загрузите фото комнаты.");
    if (!products.length) return setError("Добавьте хотя бы одно фото мебели.");
    if (missingPoint) {
      setPlacingProductId(missingPoint.id);
      return setError(`Укажите на экране место для предмета «${missingPoint.name}».`);
    }
    if (!user) return setError("Войдите в Room Design, чтобы создать рендер.");
    if (!generationConfigured) return setError("Генерация сейчас недоступна: AI provider не настроен.");
    setError("");
    setPhase("processing");
    setProgress(0);
    let currentRoom = room.dataUrl;
    try {
      for (let index = 0; index < products.length; index += 1) {
        const product = products[index];
        const placement = placements[product.id];
        const markedImage = await createPointMarkerImage(currentRoom, placement);
        const operationId = crypto.randomUUID();
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
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
          throw new Error(payload.error || `Не удалось добавить предмет ${index + 1}.`);
        }
        currentRoom = await blobToDataUrl(await response.blob());
        const item = { id: operationId, name: product.name, dataUrl: currentRoom, createdAt: new Date().toISOString(), productCount: index + 1 };
        setHistory((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
        setLatestResult(item);
        setProgress(Math.round((index + 1) * 100 / products.length));
      }
      setPhase("idle");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Генерация не завершилась.");
      setPhase("failed");
    }
  };

  return (
    <section className="furniture-casting-workspace" id="workspace" aria-labelledby="furniture-workspace-title">
      <div className="furniture-actions">
        <h2 id="furniture-workspace-title">Создайте свой рендер</h2>
        <label className={room ? "has-file" : ""}>
          <input type="file" accept={roomSlot.acceptedMimeTypes.join(",")} onChange={(event) => void uploadRoom(event)} />
          <span>{room ? "Заменить фото комнаты" : "Загрузить фото комнаты"}</span>
          {room && <small>{room.name}</small>}
        </label>
        <label className={products.length ? "has-file" : ""}>
          <input type="file" multiple accept={productSlot.acceptedMimeTypes.join(",")} onChange={(event) => void uploadProducts(event)} />
          <span>Добавить фото мебели</span>
          <small>{products.length ? `${products.length} из ${productSlot.maxCount}` : "1–5 предметов"}</small>
        </label>
        <button className="furniture-create-button" type="button" disabled={phase === "processing"} onClick={() => void runGeneration()}>{phase === "processing" ? `Создаём · ${progress}%` : "Создать рендер"}<span>→</span></button>
      </div>

      {products.length > 0 && <div className="furniture-product-points" aria-label="Точки размещения мебели">
        {products.map((product, index) => <article key={product.id} className={placingProductId === product.id ? "is-active" : ""}>
          <img src={product.dataUrl} alt="" />
          <button type="button" onClick={() => setPlacingProductId(product.id)}><b>{String(index + 1).padStart(2, "0")} · {product.name}</b><span>{placements[product.id] ? "Точка выбрана · изменить" : "Указать точку на экране"}</span></button>
          <button type="button" aria-label={`Удалить ${product.name}`} onClick={() => removeProduct(product.id)}>×</button>
        </article>)}
      </div>}

      <div className="furniture-stage-heading">
        <div><p>РЕЗУЛЬТАТ</p><h2>{latestResult ? "Готовый рендер" : room ? "Выберите место для мебели" : "Здесь появится ваш интерьер"}</h2></div>
        {room && products.length > 0 && <span>{completedPoints} / {products.length} точек</span>}
      </div>

      <div className={`furniture-stage${placingProductId ? " is-placing" : ""}${latestResult && !placingProductId ? " has-result" : ""}`}>
        {stageImage ? <button type="button" onClick={handleStageClick} aria-label={placingProductId ? `Указать точку для ${activeProduct?.name || "мебели"}` : latestResult ? "Открыть готовый рендер на весь экран" : "Изображение комнаты"}>
          <img src={stageImage} alt={latestResult && !placingProductId ? "Готовый рендер интерьера" : "Загруженная комната"} />
          {placingProductId && Object.entries(placements).map(([productId, point]) => {
            const index = products.findIndex((product) => product.id === productId);
            return <span className="furniture-stage-point" key={productId} style={{ left: `${point.x}%`, top: `${point.y}%` }}>{index + 1}</span>;
          })}
          {placingProductId && <em>Поставьте точку для «{activeProduct?.name}»</em>}
          {latestResult && !placingProductId && <em>Нажмите, чтобы открыть на весь экран</em>}
        </button> : <div><span>ROOM DESIGN</span><p>Загрузите фото комнаты, чтобы начать.</p></div>}
        {phase === "processing" && <div className="furniture-stage-progress" role="status"><i style={{ width: `${progress}%` }} /><b>Создаём рендер · {progress}%</b><p>Предметы добавляются последовательно.</p></div>}
      </div>

      {error && <p className="furniture-error" role="alert">{error}</p>}
      {authChecked && !user && <p className="furniture-note">Для генерации нужен вход. <Link href="/#кабинет">Войти →</Link></p>}
      {user && !generationConfigured && <p className="furniture-note">Генерация временно недоступна.</p>}

      <section className="furniture-history" aria-labelledby="furniture-history-title">
        <header><p>ИСТОРИЯ ГЕНЕРАЦИЙ</p><h2 id="furniture-history-title">Все ваши варианты</h2></header>
        {history.length ? <div>{history.map((item, index) => <button type="button" key={item.id} onClick={() => setLightbox(item)}>
          <img src={item.dataUrl} alt={`Рендер ${history.length - index}`} />
          <span><b>Рендер {String(history.length - index).padStart(2, "0")}</b><small>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</small></span>
        </button>)}</div> : <p>После первой генерации здесь появятся сохранённые варианты.</p>}
      </section>

      {lightbox && <div className="furniture-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр готового рендера">
        <button type="button" aria-label="Закрыть полноэкранный просмотр" onClick={() => setLightbox(null)}>×</button>
        <img src={lightbox.dataUrl} alt={lightbox.name} />
      </div>}
    </section>
  );
}
