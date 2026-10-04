"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";

import type { TemplateDefinition, TemplateInputSlot } from "@/lib/templates/types";

type UploadedInput = { id: string; name: string; type: string; size: number; dataUrl: string };
type FurnitureProduct = UploadedInput & { createdAt: string };
type StoredFurnitureProduct = FurnitureProduct & { ownerId: string };
type Point = { x: number; y: number };
type HistoryItem = { id: string; name: string; dataUrl: string; createdAt: string; productCount: number };
type User = { id: string; email: string; firstName?: string; lastName?: string };
type Phase = "idle" | "processing" | "failed";

const FURNITURE_CASTING_PROMPT = "Мебельный кастинг: разместить все выбранные предметы в указанных точках одним цельным рендером, сохранив комнату и ракурс.";
const FINAL_RENDER_MARKER = "final:yes";
const FURNITURE_LIBRARY_DATABASE = "room-design-furniture-library";
const FURNITURE_LIBRARY_STORE = "products";

const openFurnitureLibrary = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(FURNITURE_LIBRARY_DATABASE, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(FURNITURE_LIBRARY_STORE)) request.result.createObjectStore(FURNITURE_LIBRARY_STORE, { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Не удалось открыть библиотеку мебели."));
});

const loadFurnitureLibrary = async (ownerId: string) => {
  const database = await openFurnitureLibrary();
  return new Promise<FurnitureProduct[]>((resolve, reject) => {
    const request = database.transaction(FURNITURE_LIBRARY_STORE, "readonly").objectStore(FURNITURE_LIBRARY_STORE).getAll();
    request.onsuccess = () => {
      const products = (request.result as StoredFurnitureProduct[])
        .filter((product) => product.ownerId === ownerId)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
        .map((product) => ({ id: product.id, name: product.name, type: product.type, size: product.size, dataUrl: product.dataUrl, createdAt: product.createdAt }));
      database.close();
      resolve(products);
    };
    request.onerror = () => { database.close(); reject(request.error || new Error("Не удалось загрузить библиотеку мебели.")); };
  });
};

const saveFurnitureProducts = async (ownerId: string, products: FurnitureProduct[]) => {
  const database = await openFurnitureLibrary();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FURNITURE_LIBRARY_STORE, "readwrite");
    const store = transaction.objectStore(FURNITURE_LIBRARY_STORE);
    products.forEach((product) => store.put({ ...product, ownerId } satisfies StoredFurnitureProduct));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Не удалось сохранить мебель.")); };
  });
};

const deleteFurnitureProduct = async (id: string) => {
  const database = await openFurnitureLibrary();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FURNITURE_LIBRARY_STORE, "readwrite");
    transaction.objectStore(FURNITURE_LIBRARY_STORE).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Не удалось удалить мебель.")); };
  });
};

const readFile = (file: File, maxDimension: number) => new Promise<UploadedInput>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const originalDataUrl = String(reader.result || "");
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale === 1) return resolve({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, dataUrl: originalDataUrl });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Не удалось подготовить изображение."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/webp", 0.9);
      resolve({ id: crypto.randomUUID(), name: file.name, type: "image/webp", size: Math.round(dataUrl.length * 0.75), dataUrl });
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
  reader.onerror = () => reject(new Error("Не удалось подготовить результат."));
  reader.readAsDataURL(blob);
});

const createPlacementGuideImage = (source: string, items: Array<{ point: Point; number: number }>) => new Promise<string>((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return reject(new Error("Не удалось подготовить выбранную точку."));
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
  const [products, setProducts] = useState<FurnitureProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Record<string, Point>>({});
  const [placingProductId, setPlacingProductId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [latestResult, setLatestResult] = useState<HistoryItem | null>(null);
  const [lightbox, setLightbox] = useState<HistoryItem | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [generationConfigured, setGenerationConfigured] = useState(false);
  const productStripRef = useRef<HTMLDivElement>(null);

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
        const [response, savedProducts] = await Promise.all([
          fetch("/api/account/generations"),
          loadFurnitureLibrary(me.user.id).catch(() => []),
        ]);
        const payload = await response.json().catch(() => ({ generations: [] }));
        if (!active) return;
        setProducts((current) => [...savedProducts, ...current.filter((product) => !savedProducts.some((savedProduct) => savedProduct.id === product.id))]);
        if (!response.ok) return;
        const stored = (payload.generations || [])
          .filter((generation: { operation?: string; prompt?: string }) => generation.operation === "place" && generation.prompt?.startsWith(FURNITURE_CASTING_PROMPT) && generation.prompt.includes(FINAL_RENDER_MARKER))
          .map((generation: { id: string; created_at: string; prompt: string }) => ({
            id: generation.id,
            name: "Мебельный кастинг",
            dataUrl: `/api/account/generations/${generation.id}`,
            createdAt: generation.created_at,
            productCount: Number(generation.prompt.match(/items:(\d+)/)?.[1] || 1),
          }));
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

  useEffect(() => {
    if (phase !== "processing") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const selectedProducts = useMemo(() => selectedProductIds.map((id) => products.find((product) => product.id === id)).filter((product): product is FurnitureProduct => Boolean(product)), [products, selectedProductIds]);
  const activeProduct = selectedProducts.find((product) => product.id === placingProductId) || null;
  const missingPoint = selectedProducts.find((product) => !placements[product.id]);
  const stageImage = placingProductId ? room?.dataUrl : latestResult?.dataUrl || room?.dataUrl;
  const completedPoints = useMemo(() => selectedProducts.filter((product) => placements[product.id]).length, [placements, selectedProducts]);

  const uploadRoom = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      validateFiles(roomSlot, [file]);
      setRoom(await readFile(file, 2048));
      setPlacements({});
      setLatestResult(null);
      setPlacingProductId(selectedProducts[0]?.id || "");
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
      validateFiles(productSlot, files);
      const uploaded = await Promise.all(files.map((file) => readFile(file, 1280)));
      const uploadStartedAt = new Date().toISOString();
      const next = uploaded.map((product, index) => ({ ...product, createdAt: `${uploadStartedAt}:${String(index).padStart(3, "0")}` }));
      const availableSelectionSlots = Math.max(0, productSlot.maxCount - selectedProductIds.length);
      const automaticallySelected = next.slice(0, availableSelectionSlots);
      setProducts((current) => [...current, ...next]);
      setSelectedProductIds((current) => [...current, ...automaticallySelected.map((product) => product.id)]);
      setLatestResult(null);
      if (automaticallySelected[0]) setPlacingProductId((current) => current || automaticallySelected[0].id);
      await saveFurnitureProducts(user?.id || "guest", next);
      if (automaticallySelected.length < next.length) setError(`Все товары сохранены в ленте. Для одного рендера можно выбрать до ${productSlot.maxCount}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить мебель.");
    }
  };

  const toggleProductSelection = (product: FurnitureProduct) => {
    const isSelected = selectedProductIds.includes(product.id);
    setLatestResult(null);
    setError("");
    if (isSelected) {
      const remainingProducts = selectedProducts.filter((item) => item.id !== product.id);
      setSelectedProductIds((current) => current.filter((id) => id !== product.id));
      setPlacements((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      if (placingProductId === product.id) setPlacingProductId(remainingProducts.find((item) => !placements[item.id])?.id || "");
      return;
    }
    if (selectedProductIds.length >= productSlot.maxCount) return setError(`Для одного рендера можно выбрать до ${productSlot.maxCount} товаров.`);
    setSelectedProductIds((current) => [...current, product.id]);
    setPlacingProductId((current) => current || product.id);
  };

  const selectProductPlacement = (product: FurnitureProduct) => {
    if (!selectedProductIds.includes(product.id)) return toggleProductSelection(product);
    setPlacingProductId(product.id);
    setError("");
  };

  const removeProduct = async (id: string) => {
    setProducts((current) => current.filter((product) => product.id !== id));
    setSelectedProductIds((current) => current.filter((productId) => productId !== id));
    setLatestResult(null);
    setPlacements((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (placingProductId === id) {
      const nextProduct = selectedProducts.find((product) => product.id !== id && !placements[product.id]);
      setPlacingProductId(nextProduct?.id || "");
    }
    try {
      await deleteFurnitureProduct(id);
    } catch {
      setError("Товар убран из ленты, но локальное хранилище не удалось обновить.");
    }
  };

  const handleStageClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!placingProductId || !room) {
      if (latestResult) setLightbox(latestResult);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) * 100 / bounds.width, y: (event.clientY - bounds.top) * 100 / bounds.height };
    setLatestResult(null);
    setPlacements((current) => ({ ...current, [placingProductId]: point }));
    const nextProduct = selectedProducts.find((product) => product.id !== placingProductId && !placements[product.id]);
    setPlacingProductId(nextProduct?.id || "");
    setError("");
  };

  const runGeneration = async () => {
    if (!room) return setError("Сначала загрузите фото комнаты.");
    if (!selectedProducts.length) return setError("Выберите хотя бы один товар из ленты.");
    if (missingPoint) {
      setPlacingProductId(missingPoint.id);
      return setError(`Укажите на экране место для предмета «${missingPoint.name}».`);
    }
    if (!user) return setError("Войдите в Room Design, чтобы создать рендер.");
    if (!generationConfigured) return setError("Генерация сейчас недоступна: AI provider не настроен.");
    setError("");
    setElapsedSeconds(0);
    setPhase("processing");
    try {
      const markedImage = await createPlacementGuideImage(room.dataUrl, selectedProducts.map((product, index) => ({ point: placements[product.id], number: index + 1 })));
      const operationId = crypto.randomUUID();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
        body: JSON.stringify({
          operation: "place",
          prompt: `${FURNITURE_CASTING_PROMPT} [items:${selectedProducts.length}; ${FINAL_RENDER_MARKER}]`,
          roomImage: room.dataUrl,
          furnitureCasting: {
            markedImage,
            items: selectedProducts.map((product) => ({ ...placements[product.id], name: product.name, referenceImage: product.dataUrl })),
          },
          outputSize: "1536x1024",
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Не удалось создать рендер.");
      }
      const finalItem: HistoryItem = { id: operationId, name: "Мебельный кастинг", dataUrl: await blobToDataUrl(await response.blob()), createdAt: new Date().toISOString(), productCount: selectedProducts.length };
      setHistory((current) => [finalItem, ...current.filter((entry) => entry.id !== finalItem.id)]);
      setLatestResult(finalItem);
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
          <small>{products.length ? `${selectedProducts.length} выбрано · ${products.length} в ленте` : "Товары сохранятся в вашей ленте"}</small>
        </label>
        <button className="furniture-create-button" type="button" disabled={phase === "processing"} onClick={() => void runGeneration()}>{phase === "processing" ? "Создаём единый рендер…" : "Создать рендер"}<span>→</span></button>
      </div>

      {products.length > 0 && <section className="furniture-product-library" aria-labelledby="furniture-library-title">
        <header>
          <div><p>ВАША МЕБЕЛЬ</p><b id="furniture-library-title">Выбрано {selectedProducts.length} из {productSlot.maxCount}</b></div>
          <span>Выберите товары для текущего рендера</span>
          <nav aria-label="Прокрутка ленты мебели">
            <button type="button" aria-label="Прокрутить мебель влево" onClick={() => productStripRef.current?.scrollBy({ left: -340, behavior: "smooth" })}>←</button>
            <button type="button" aria-label="Прокрутить мебель вправо" onClick={() => productStripRef.current?.scrollBy({ left: 340, behavior: "smooth" })}>→</button>
          </nav>
        </header>
        <div className="furniture-product-points" ref={productStripRef} aria-label="Сохранённая мебель">
          {products.map((product) => {
            const selectedIndex = selectedProductIds.indexOf(product.id);
            const selected = selectedIndex >= 0;
            return <article key={product.id} className={`${selected ? "is-selected" : ""}${placingProductId === product.id ? " is-active" : ""}`}>
              <button className="furniture-product-select" type="button" aria-pressed={selected} aria-label={selected ? `Убрать ${product.name} из рендера` : `Выбрать ${product.name} для рендера`} onClick={() => toggleProductSelection(product)}>{selected ? "✓" : "+"}</button>
              <img src={product.dataUrl} alt="" />
              <button className="furniture-product-place" type="button" onClick={() => selectProductPlacement(product)}><b>{selected ? `${String(selectedIndex + 1).padStart(2, "0")} · ` : ""}{product.name}</b><span>{selected ? placements[product.id] ? "Выбран · точку можно изменить" : "Выбран · укажите точку" : "Выбрать для рендера"}</span></button>
              <button className="furniture-product-delete" type="button" aria-label={`Удалить ${product.name} из ленты`} onClick={() => void removeProduct(product.id)}>×</button>
            </article>;
          })}
        </div>
      </section>}

      <div className="furniture-stage-heading">
        <div><p>РЕЗУЛЬТАТ</p><h2>{latestResult ? "Готовый рендер" : room ? selectedProducts.length ? "Выберите место для мебели" : "Выберите мебель из ленты" : "Здесь появится ваш интерьер"}</h2></div>
        {room && selectedProducts.length > 0 && <span>{completedPoints} / {selectedProducts.length} точек</span>}
      </div>

      <div className={`furniture-stage${placingProductId ? " is-placing" : ""}${latestResult && !placingProductId ? " has-result" : ""}`}>
        {stageImage ? <button type="button" onClick={handleStageClick} aria-label={placingProductId ? `Указать точку для ${activeProduct?.name || "мебели"}` : latestResult ? "Открыть готовый рендер на весь экран" : "Изображение комнаты"}>
          <img src={stageImage} alt={latestResult && !placingProductId ? "Готовый рендер интерьера" : "Загруженная комната"} />
          {!latestResult && phase !== "processing" && Object.entries(placements).map(([productId, point]) => {
            const index = selectedProducts.findIndex((product) => product.id === productId);
            return <span className="furniture-stage-point" key={productId} style={{ left: `${point.x}%`, top: `${point.y}%` }}>{index + 1}</span>;
          })}
          {placingProductId && <em>Поставьте точку для «{activeProduct?.name}»</em>}
          {latestResult && !placingProductId && <em>Нажмите, чтобы открыть на весь экран</em>}
        </button> : <div><span>ROOM DESIGN</span><p>Загрузите фото комнаты, чтобы начать.</p></div>}
        {phase === "processing" && <div className="furniture-stage-progress" role="status"><i /><b>Создаём единый рендер · {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</b><p>Размещаем все предметы одновременно. Сложный рендер может занять несколько минут.</p></div>}
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
