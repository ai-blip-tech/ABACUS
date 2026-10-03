"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  buildProposalProducts,
  proposalOverrideFor,
  proposalTotal,
  type ProposalCatalogProduct,
  type ProposalPlanItem,
  type ProposalProduct,
} from "@/lib/commercial-proposal";

type ProjectPayload = {
  project?: { name?: string; project_type?: string };
  state?: {
    planItems?: ProposalPlanItem[];
    proposalShowPrices?: boolean;
    generatedImage?: string;
    interiorImage?: string;
  };
};

const money = (value?: number) => value === undefined ? "Цена не указана" : `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Не удалось подготовить изображение для PDF."));
  reader.readAsDataURL(blob);
});
const pdfImage = async (source: string) => {
  if (!source || source.startsWith("data:") || /^https?:\/\//i.test(source)) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error("Не удалось подготовить изображение проекта для PDF.");
  return dataUrl(await response.blob());
};

export default function ProposalEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [products, setProducts] = useState<ProposalProduct[]>([]);
  const [showPrices, setShowPrices] = useState(true);
  const [status, setStatus] = useState("Загружаем проект…");
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
        const payload = await response.json() as ProjectPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Не удалось открыть проект.");
        const items = payload.state?.planItems || [];
        const ids = [...new Set(items.map((item) => item.referenceProductId).filter((id): id is string => Boolean(id)))];
        let catalog = new Map<string, ProposalCatalogProduct>();
        if (ids.length) {
          const catalogResponse = await fetch(`/api/catalog?ids=${encodeURIComponent(ids.join(","))}`);
          const catalogPayload = await catalogResponse.json().catch(() => ({ products: [] })) as { products?: ProposalCatalogProduct[] };
          if (catalogResponse.ok) catalog = new Map((catalogPayload.products || []).map((item) => [item.id, item]));
        }
        if (!active) return;
        const mapped = buildProposalProducts(items, catalog);
        setProject(payload);
        setProducts(mapped);
        setShowPrices(payload.state?.proposalShowPrices !== false);
        setStatus(mapped.length ? "Все изменения сохраняются автоматически" : "В проекте нет товаров с референсами");
        loaded.current = true;
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Не удалось открыть редактор.");
      }
    })();
    return () => { active = false; };
  }, [projectId]);

  const save = useCallback(async (nextProducts: ProposalProduct[], nextShowPrices: boolean) => {
    setStatus("Сохраняем изменения…");
    const items = nextProducts.flatMap((product) => product.objectIds.map((id) => ({ id, proposalOverride: proposalOverrideFor(product) })));
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/proposal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showPrices: nextShowPrices, items }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Не удалось сохранить коммерческое предложение.");
    setStatus("Изменения сохранены");
  }, [projectId]);

  const queueSave = useCallback((nextProducts: ProposalProduct[], nextShowPrices: boolean) => {
    if (!loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(nextProducts, nextShowPrices).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить изменения.");
      setStatus("Есть несохранённые изменения");
    }), 650);
  }, [save]);

  const update = (key: string, patch: Partial<ProposalProduct>) => {
    const next = products.map((product) => product.key === key ? { ...product, ...patch } : product);
    setProducts(next);
    setError("");
    queueSave(next, showPrices);
  };
  const setPriceVisibility = (checked: boolean) => {
    setShowPrices(checked);
    queueSave(products, checked);
  };
  const total = useMemo(() => proposalTotal(products), [products]);
  const missingPrices = products.filter((product) => product.price === undefined).length;

  const download = async () => {
    if (!project?.state) return;
    setDownloading(true);
    setError("");
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await save(products, showPrices);
      const coverSource = project.state.generatedImage || project.state.interiorImage || "";
      const [coverImage, proposalCoverImage, fontData, preparedProducts] = await Promise.all([
        pdfImage(coverSource),
        pdfImage("/proposal-cover.png"),
        pdfImage("/fonts/Arial.ttf"),
        Promise.all(products.map(async (product) => ({
          ...product,
          referenceName: product.name,
          referenceImage: await pdfImage(product.image),
          referenceImages: product.images,
          referenceArticle: product.article,
          referenceUrl: product.url,
          referencePrice: product.price,
          referenceOldPrice: product.oldPrice,
          referenceCategory: product.category,
          referenceSubtype: product.subtype,
          referenceColor: product.color,
          referenceMaterial: product.material,
          referenceHeightMm: product.height,
          referenceDescription: product.description,
          referenceParameters: product.parameters,
        }))),
      ]);
      const response = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName: project.project?.name || "ROOM design", proposalCoverImage, coverImage, fontData, withPrices: showPrices, products: preparedProducts }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Не удалось создать PDF.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "room-design-commercial-proposal.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось скачать PDF.");
    } finally {
      setDownloading(false);
    }
  };

  if (error && !project) return <main className="proposal-editor-state"><h1>Коммерческое предложение</h1><p role="alert">{error}</p><Link href="/">Вернуться в Room Design</Link></main>;

  return <main className="proposal-editor-shell">
    <header className="proposal-editor-header">
      <Link href="/">ROOM<span>DESIGN</span></Link>
      <div><small>КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</small><b>{project?.project?.name || "Проект"}</b></div>
      <div className="proposal-editor-actions">
        <label><input type="checkbox" checked={showPrices} onChange={(event) => setPriceVisibility(event.target.checked)}/> Показывать цены</label>
        <button type="button" onClick={() => void download()} disabled={downloading || !products.length}>{downloading ? "Готовим PDF…" : "Скачать PDF"}</button>
      </div>
    </header>
    <section className="proposal-editor-toolbar">
      <Link href="/">← Вернуться в проект</Link><span>{status}</span>
      {showPrices && missingPrices > 0 && <strong>Для {missingPrices} {missingPrices === 1 ? "товара цена не указана" : "товаров цена не указана"}.</strong>}
      {error && <strong role="alert">{error}</strong>}
    </section>
    <section className="proposal-document" aria-label="Предпросмотр коммерческого предложения">
      <article className="proposal-page proposal-cover-page">
        <img src="/proposal-cover.png" alt=""/><div><b>ROOM DESIGN</b><h1>КОММЕРЧЕСКОЕ<br/>ПРЕДЛОЖЕНИЕ</h1><p>{project?.project?.name}</p></div>
      </article>
      {(project?.state?.generatedImage || project?.state?.interiorImage) && <article className="proposal-page proposal-visual-page"><img src={project.state.generatedImage || project.state.interiorImage} alt="Визуализация проекта"/></article>}
      {products.map((product, index) => <article className="proposal-page proposal-product-page" key={product.key}>
        <aside>
          <small>{String(index + 3).padStart(2, "0")} · {product.source === "catalog" ? "КАТАЛОГ" : "РЕФЕРЕНС"}</small>
          <input aria-label="Наименование" value={product.name} onChange={(event) => update(product.key, { name: event.target.value })}/>
          <div className="proposal-dimensions">
            {(["width", "height", "depth"] as const).map((field) => <label key={field}>{field === "width" ? "Ширина" : field === "height" ? "Высота" : "Глубина"}<input type="number" min="0" value={product[field] ?? ""} onChange={(event) => update(product.key, { [field]: event.target.value === "" ? undefined : Number(event.target.value) })}/><span>мм</span></label>)}
          </div>
          {product.quantity > 1 && <p>Количество: <b>{product.quantity}</b></p>}
          {product.article && <p>Артикул: <b>{product.article}</b></p>}
          <label className="proposal-notes">Дополнительные параметры<textarea value={product.notes} placeholder="Материал, цвет, срок поставки или другое примечание" onChange={(event) => update(product.key, { notes: event.target.value })}/></label>
        </aside>
        <div className="proposal-product-content">
          <img src={product.image} alt={product.name}/>
          {showPrices && <label className="proposal-price">Цена за единицу<input aria-label={`Цена: ${product.name}`} type="number" min="0" value={product.price ?? ""} placeholder="Не указана" onChange={(event) => update(product.key, { price: event.target.value === "" ? undefined : Number(event.target.value) })}/><span>₽</span>{product.quantity > 1 && product.price !== undefined && <small>Итого: {money(product.price * product.quantity)}</small>}</label>}
        </div>
      </article>)}
      {showPrices && <article className="proposal-page proposal-total-page"><small>ИТОГ КОММЕРЧЕСКОГО ПРЕДЛОЖЕНИЯ</small><h2>{project?.project?.name}</h2><p>{products.length} поз. / {products.reduce((sum, product) => sum + product.quantity, 0)} шт.</p><div><span>ИТОГО</span><b>{total ? money(total) : "Цена по запросу"}</b></div></article>}
      {!products.length && project && <article className="proposal-empty"><h2>Нет товаров для предложения</h2><p>Добавьте в планограмму товары из каталога или предметы с собственными референсами и сохраните проект.</p></article>}
    </section>
  </main>;
}
