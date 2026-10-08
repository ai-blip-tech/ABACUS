"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  buildProposalProducts, defaultProposalDocument, mergeProposalDocument, paginateProposalSpecification, proposalOverrideFor, proposalTotal,
  type ProposalCatalogProduct, type ProposalDocument, type ProposalPlanItem, type ProposalProduct,
} from "@/lib/commercial-proposal";

type User = { firstName?: string; lastName?: string; email?: string; phone?: string; companyRole?: string };
type ProjectPayload = {
  project?: { name?: string; project_type?: string };
  state?: {
    planItems?: ProposalPlanItem[]; proposalItems?: ProposalPlanItem[]; proposalShowPrices?: boolean; proposalVisualization?: string;
    generatedImage?: string; interiorImage?: string; proposalDocument?: Partial<ProposalDocument>;
  };
};

const money = (value?: number) => value === undefined ? "Цена по запросу" : `${new Intl.NumberFormat("ru-RU").format(value)} руб.`;
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Не удалось подготовить изображение для PDF.")); reader.readAsDataURL(blob);
});
const pdfImage = async (source: string) => {
  if (!source || source.startsWith("data:") || /^https?:\/\//i.test(source)) return source;
  const response = await fetch(source); if (!response.ok) throw new Error("Не удалось подготовить изображение проекта для PDF.");
  return dataUrl(await response.blob());
};
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "NM";

function Field({ label, value, onChange, multiline = false, className = "" }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; className?: string;
}) {
  return <label className={`proposal-field ${className}`}><span>{label}</span>{multiline
    ? <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}/>
    : <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}/>}</label>;
}

function PageMark({ number, title }: { number: string; title: string }) {
  return <div className="proposal-page-mark"><b>{number}</b><i/><span>{title}</span></div>;
}

function ProposalHeader({ number, title }: { number: string; title: string }) {
  return <><PageMark number={number} title={title}/><div className="proposal-running-head"><b>NORR</b><i>/</i><span>ПЕРСОНАЛЬНАЯ ПОДБОРКА</span></div></>;
}

function ProductHeader({ number, category }: { number: string; category: string }) {
  return <><PageMark number={number} title=""/><div className="proposal-product-category">{category}</div><div className="proposal-running-head"><b>NORR</b><i>/</i><span>ПЕРСОНАЛЬНАЯ ПОДБОРКА</span></div></>;
}

function ProposalFooter() {
  return <div className="proposal-page-footer"><b>NORR möbler</b><i>•</i><span>norrmobler.ru</span></div>;
}

export default function ProposalEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [user, setUser] = useState<User>({});
  const [products, setProducts] = useState<ProposalProduct[]>([]);
  const [document, setDocument] = useState<ProposalDocument>(() => defaultProposalDocument("", 0));
  const [showPrices, setShowPrices] = useState(true);
  const [status, setStatus] = useState("Загружаем проект…");
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<"pdf" | "pptx" | "">("");
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [response, authResponse] = await Promise.all([
          fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);
        const payload = await response.json() as ProjectPayload & { error?: string };
        const auth = await authResponse.json().catch(() => ({ user: {} })) as { user?: User };
        if (!response.ok) throw new Error(payload.error || "Не удалось открыть проект.");
        const items = [...new Map([
          ...(payload.state?.planItems || []),
          ...(payload.state?.proposalItems || []),
        ].map((item) => [item.id, item])).values()];
        const ids = [...new Set(items.map((item) => item.referenceProductId).filter((id): id is string => Boolean(id)))];
        let catalog = new Map<string, ProposalCatalogProduct>();
        if (ids.length) {
          const catalogResponse = await fetch(`/api/catalog?ids=${encodeURIComponent(ids.join(","))}`);
          const catalogPayload = await catalogResponse.json().catch(() => ({ products: [] })) as { products?: ProposalCatalogProduct[] };
          if (catalogResponse.ok) catalog = new Map((catalogPayload.products || []).map((item) => [item.id, item]));
        }
        if (!active) return;
        const mapped = buildProposalProducts(items, catalog);
        const profile = auth.user || {};
        const defaults = defaultProposalDocument(payload.project?.name || "", mapped.length);
        defaults.managerPhone = profile.phone || "";
        defaults.managerEmail = profile.email || "";
        defaults.managerRole = profile.companyRole || defaults.managerRole;
        setProject(payload); setUser(profile); setProducts(mapped);
        setDocument(mergeProposalDocument(payload.state?.proposalDocument, defaults));
        setShowPrices(payload.state?.proposalShowPrices !== false);
        setStatus(mapped.length ? "Все изменения сохраняются автоматически" : "В проекте нет товаров с референсами");
        loaded.current = true;
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Не удалось открыть редактор."); }
    })();
    return () => { active = false; };
  }, [projectId]);

  const save = useCallback(async (nextProducts: ProposalProduct[], nextShowPrices: boolean, nextDocument: ProposalDocument) => {
    setStatus("Сохраняем изменения…");
    const items = nextProducts.flatMap((product) => product.objectIds.map((id) => ({ id, proposalOverride: proposalOverrideFor(product) })));
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/proposal`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showPrices: nextShowPrices, items, document: nextDocument }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Не удалось сохранить коммерческое предложение.");
    setStatus("Изменения сохранены");
  }, [projectId]);

  const queueSave = useCallback((nextProducts: ProposalProduct[], nextShowPrices: boolean, nextDocument: ProposalDocument) => {
    if (!loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(nextProducts, nextShowPrices, nextDocument).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить изменения."); setStatus("Есть несохранённые изменения");
    }), 650);
  }, [save]);

  const updateProduct = (key: string, patch: Partial<ProposalProduct>) => {
    const next = products.map((product) => product.key === key ? { ...product, ...patch } : product);
    setProducts(next); setError(""); queueSave(next, showPrices, document);
  };
  const updateDocument = (patch: Partial<ProposalDocument>) => {
    const next = { ...document, ...patch }; setDocument(next); setError(""); queueSave(products, showPrices, next);
  };
  const setPriceVisibility = (checked: boolean) => { setShowPrices(checked); queueSave(products, checked, document); };
  const total = useMemo(() => proposalTotal(products), [products]);
  const specificationPages = useMemo(() => paginateProposalSpecification(products), [products]);
  const visual = project?.state?.proposalVisualization || project?.state?.generatedImage || project?.state?.interiorImage || "";
  const managerName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Имя Фамилия";

  const download = async (format: "pdf" | "pptx") => {
    if (!project?.state) return;
    setDownloading(format); setError("");
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await save(products, showPrices, document);
      await window.document.fonts.ready;
      const [coverImage, coverBrandAsset, fontData, fontBoldData, serifFontData, serifItalicFontData, serifBoldFontData, preparedProducts] = await Promise.all([
        pdfImage(visual), pdfImage("/proposal/cover-brand-approved.png"), pdfImage("/fonts/Arial.ttf"), pdfImage("/fonts/Arial-Bold.ttf"),
        pdfImage("/fonts/Georgia.ttf"), pdfImage("/fonts/Georgia-Italic.ttf"), pdfImage("/fonts/Georgia-Bold.ttf"),
        Promise.all(products.map(async (product) => ({ ...product, referenceImage: await pdfImage(product.image) }))),
      ]);
      const response = await fetch(format === "pdf" ? "/api/proposal" : "/api/proposal/pptx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName: document.projectName, coverImage, coverBrandAsset, fontData, fontBoldData, serifFontData, serifItalicFontData, serifBoldFontData, withPrices: showPrices, products: preparedProducts, document, managerName }),
      });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || `Не удалось создать ${format === "pdf" ? "PDF" : "PPTX"}.`); }
      const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = window.document.createElement("a");
      link.href = href; link.download = `NORR_Mobler_Коммерческое_предложение.${format}`; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Не удалось скачать ${format === "pdf" ? "PDF" : "PPTX"}.`); }
    finally { setDownloading(""); }
  };

  if (error && !project) return <main className="proposal-editor-state"><h1>Коммерческое предложение</h1><p role="alert">{error}</p><Link href="/">Вернуться в Room Design</Link></main>;
  return <main className="proposal-editor-shell">
    <header className="proposal-editor-header">
      <Link className="room-design-wordmark" href="/">ROOM DESIGN</Link>
      <div><small>РЕДАКТОР КОММЕРЧЕСКОГО ПРЕДЛОЖЕНИЯ</small><b>{document.projectName || "Проект"}</b></div>
      <div className="proposal-editor-actions">
        <label><input type="checkbox" checked={showPrices} onChange={(event) => setPriceVisibility(event.target.checked)}/> Показывать цены</label>
        <button type="button" onClick={() => void download("pdf")} disabled={Boolean(downloading) || !products.length}>{downloading === "pdf" ? "Готовим PDF…" : "Скачать PDF"}</button>
        <button type="button" onClick={() => void download("pptx")} disabled={Boolean(downloading) || !products.length}>{downloading === "pptx" ? "Готовим PPT…" : "Скачать PPT"}</button>
      </div>
    </header>
    <section className="proposal-editor-toolbar"><Link href="/">← Вернуться в проект</Link><span>{status}</span>{error && <strong role="alert">{error}</strong>}</section>
    <section className="proposal-document" aria-label="Предпросмотр коммерческого предложения">
      <article className="proposal-page proposal-cover-page">
        <div className="proposal-cover-brand" aria-label="NORR MÖBLER — коммерческое предложение"/>
        <div className="proposal-cover-data"><em>NORR MÖBLER / PRIVATE SELECTION</em><i className="proposal-short-rule"/><h1>Коммерческое<br/>предложение</h1><p>Интерьер, собранный вокруг вашей жизни.</p>
          <Field label="Клиент" value={document.clientName} onChange={(clientName) => updateDocument({ clientName })}/>
          <Field label="Проект" value={document.projectName} onChange={(projectName) => updateDocument({ projectName })}/>
          <div className="proposal-cover-meta"><Field label="Предложение" value={document.offerNumber} onChange={(offerNumber) => updateDocument({ offerNumber })}/><Field label="Дата" value={document.offerDate} onChange={(offerDate) => updateDocument({ offerDate })}/></div>
          <Field label="Действительно до" value={document.validUntil} onChange={(validUntil) => updateDocument({ validUntil })}/>
          <div className="proposal-cover-bottom"><i/><span>МЕБЕЛЬ · СВЕТ · ДЕКОР</span><b>NORRMOBLER.RU</b></div>
        </div>
      </article>

      <article className="proposal-page proposal-selection-page">
        <ProposalHeader number="01" title="Подборка для вашего пространства"/><h2>Собрано в единую интерьерную историю</h2>
        <p>Мы объединили мебель, свет и фактуры так, чтобы каждая позиция работала не отдельно, а на общий сценарий пространства.</p>
        <div className="proposal-selection-body"><img src={visual} alt="Выбранная визуализация проекта"/><aside><small>ВАША ПОДБОРКА</small>
          <Field label="Количество предметов" value={document.selectionCount} onChange={(selectionCount) => updateDocument({ selectionCount })}/>
          <Field label="Категории" value={document.categories} multiline onChange={(categories) => updateDocument({ categories })}/>
          <Field label="Принцип" value={document.principle} multiline onChange={(principle) => updateDocument({ principle })}/>
          <Field label="Город / объект" value={document.cityObject} onChange={(cityObject) => updateDocument({ cityObject })}/></aside></div><ProposalFooter/>
      </article>

      {products.map((product, index) => {
        const isLamp = /свет|ламп|торшер/i.test(`${product.category} ${product.name}`);
        const isRug = /ковр|фактур|шкур/i.test(`${product.category} ${product.name}`);
        return <article className={`proposal-page proposal-product-page ${isLamp ? "proposal-product-lamp" : isRug ? "proposal-product-rug" : "proposal-product-furniture"}`} key={product.key}>
        <ProductHeader number={String(index + 2).padStart(2, "0")} category={product.category}/>
        <Field label="Наименование" className="proposal-product-title" value={product.name} onChange={(name) => updateProduct(product.key, { name })}/>
        <Field label="Бренд" className="proposal-product-brand" value={product.brand} onChange={(brand) => updateProduct(product.key, { brand })}/>
        <div className="proposal-product-body"><img src={product.image} alt={product.name}/><aside>
          <div className="proposal-dimensions">{(["width", "depth", "height"] as const).map((field) => <label key={field}><span>{field === "width" ? "Ширина" : field === "depth" ? "Глубина" : "Высота"}</span><input aria-label={`${field}: ${product.name}`} type="number" min="0" value={product[field] ?? ""} onChange={(event) => updateProduct(product.key, { [field]: event.target.value ? Number(event.target.value) : undefined })}/><b>мм</b></label>)}</div>
          <Field label="Артикул" value={product.article} onChange={(article) => updateProduct(product.key, { article })}/>
          {isLamp ? <><Field label="Тип" value={product.subtype || product.configuration} onChange={(configuration) => updateProduct(product.key, { configuration })}/><Field label="Цвет / версия" value={product.color || product.option} onChange={(option) => updateProduct(product.key, { option })}/></>
            : isRug ? <><Field label="Тип" value={product.subtype || product.configuration} onChange={(configuration) => updateProduct(product.key, { configuration })}/><Field label="Рисунок" value={product.color || product.option} onChange={(option) => updateProduct(product.key, { option })}/></>
              : <><Field label="Конфигурация" value={product.configuration} onChange={(configuration) => updateProduct(product.key, { configuration })}/><Field label="Обивка / вариант" value={product.option} onChange={(option) => updateProduct(product.key, { option })}/></>}
          <div className="proposal-extra"><span>Дополнительные характеристики</span>{product.characteristics.map((value, characteristicIndex) => <input key={characteristicIndex} aria-label={`Характеристика ${characteristicIndex + 1}: ${product.name}`} value={value} onChange={(event) => { const characteristics = [...product.characteristics]; characteristics[characteristicIndex] = event.target.value; updateProduct(product.key, { characteristics }); }}/>)}</div>
        </aside></div>
        <div className="proposal-product-strip"><Field label="Комплектация" value={product.configuration} onChange={(configuration) => updateProduct(product.key, { configuration })}/><label className="proposal-field"><span>Количество</span><input aria-label={`Количество: ${product.name}`} type="number" min="1" value={product.quantity} onChange={(event) => updateProduct(product.key, { quantity: Math.max(1, Number(event.target.value) || 1) })}/></label>{showPrices && <label className="proposal-field"><span>Стоимость</span><input aria-label={`Цена: ${product.name}`} type="number" min="0" value={product.price ?? ""} placeholder="Цена по запросу" onChange={(event) => updateProduct(product.key, { price: event.target.value ? Number(event.target.value) : undefined })}/></label>}</div>
        <Field label="Примечание" className="proposal-product-note" value={product.notes} onChange={(notes) => updateProduct(product.key, { notes })}/><ProposalFooter/>
      </article>;})}

      {specificationPages.map((pageProducts, pageIndex) => {
        const finalPage = pageIndex === specificationPages.length - 1;
        const previousRows = specificationPages.slice(0, pageIndex).reduce((count, page) => count + page.length, 0);
        const pageNumber = products.length + 2 + pageIndex;
        return <article className={`proposal-page proposal-summary-page ${finalPage ? "has-final-summary" : "is-continuation"}`} key={`summary-${pageIndex}`}><ProposalHeader number={String(pageNumber).padStart(2, "0")} title={finalPage ? "Итог и условия" : "Спецификация"}/><h2>{pageIndex ? "Спецификация — продолжение" : "Спецификация"}</h2>
          <div className="proposal-summary-table"><div className="proposal-summary-head"><b>№</b><b>Позиция</b><b>Артикул</b><b>Кол-во</b><b>Цена</b><b>Сумма</b></div>
            {pageProducts.map((product, index) => <div key={product.key}><span>{String(previousRows + index + 1).padStart(2, "0")}</span><span>{product.name}</span><span>{product.article || "—"}</span><span>{product.quantity}</span><span>{showPrices ? money(product.price) : "по запросу"}</span><span>{showPrices && product.price ? money(product.price * product.quantity) : "по запросу"}</span></div>)}</div>
          {finalPage && <><div className="proposal-summary-total"><Field label="Итого известных позиций" value={document.summaryNote} multiline onChange={(summaryNote) => updateDocument({ summaryNote })}/><div><small>ПРЕДВАРИТЕЛЬНЫЙ ИТОГ</small><b>{showPrices && total ? money(total) : "Цена по запросу"}</b></div></div>
          <h3>Условия предложения</h3><div className="proposal-conditions"><Field label="Срок поставки" value={document.leadTime} multiline onChange={(leadTime) => updateDocument({ leadTime })}/><Field label="Доставка и сборка" value={document.delivery} multiline onChange={(delivery) => updateDocument({ delivery })}/><Field label="Оплата" value={document.payment} multiline onChange={(payment) => updateDocument({ payment })}/></div></>}<ProposalFooter/>
        </article>;
      })}

      <article className="proposal-page proposal-about-page"><ProposalHeader number={String(products.length + 2 + specificationPages.length).padStart(2, "0")} title="О NORR möbler"/><h2>Европейский дизайн. Индивидуальный сценарий.</h2><div className="proposal-about-hero"><img src={visual} alt="Интерьер NORR möbler"/><blockquote><small>NORR MÖBLER</small><b>Интерьер начинается не с отдельного предмета, а с ощущения, которое вы хотите сохранить.</b><p>Мы соединяем мебель, свет и фактуры в цельный сценарий — спокойный, точный и персональный.</p></blockquote></div><h3>Сервис вокруг вашего проекта</h3><div className="proposal-benefits">{[["01","Персональная конфигурация","Размеры, модули, ткани и отделки подбираются под ваш интерьер."],["02","Дизайнерская поддержка","Профессиональная консультация, 3D-модели и визуализация помогают принять решение."],["03","Единый сервис","Согласование, заказ, доставка и сборка сопровождаются одним менеджером."],["04","Материалы вживую","Финальный выбор можно подтвердить в шоуруме по реальным образцам."]].map(([number,title,text]) => <div key={number}><small>{number}</small><b>{title}</b><p>{text}</p></div>)}</div><div className="proposal-about-slogan">NORR / LIVE BEAUTIFULLY</div><ProposalFooter/></article>

      <article className="proposal-page proposal-manager-page"><ProposalHeader number={String(products.length + 3 + specificationPages.length).padStart(2, "0")} title="Ваш персональный менеджер"/><div className="proposal-manager-kicker">NORR / PRIVATE SELECTION</div><div className="proposal-manager-body"><div className="proposal-manager-left"><img src="/proposal/norr-circle.svg" alt="NORR möbler"/><i/><h3>СЛЕДУЮЩИЙ ШАГ</h3><p>Подтвердите выбранные позиции или пришлите правки. Менеджер обновит конфигурации, стоимость и сценарий поставки в одной версии предложения.</p><em>Мебель, свет и декор для интерьеров, в которых хочется жить.</em></div><aside><div className="proposal-manager-person"><div className="proposal-avatar">{initials(managerName)}</div><div><h2>{managerName}</h2><Field label="Должность" value={document.managerRole} onChange={(managerRole) => updateDocument({ managerRole })}/></div></div><Field label="Телефон" value={document.managerPhone} onChange={(managerPhone) => updateDocument({ managerPhone })}/><Field label="Email" value={document.managerEmail} onChange={(managerEmail) => updateDocument({ managerEmail })}/><div className="proposal-site"><span>САЙТ</span><b>norrmobler.ru</b></div><p>Я помогу уточнить конфигурации, проверить образцы и довести заказ до установки.</p><strong>СПАСИБО, ЧТО ВЫБИРАЕТЕ NORR MÖBLER</strong></aside></div><ProposalFooter/></article>
      {!products.length && project && <article className="proposal-empty"><h2>Нет товаров для предложения</h2><p>Добавьте в планограмму товары из каталога или предметы с собственными референсами и сохраните проект.</p></article>}
    </section>
  </main>;
}
