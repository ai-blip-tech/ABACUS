import PptxGenJS from "pptxgenjs";
import sharp from "sharp";
import { requireTenantUser } from "@/lib/auth";
import { paginateProposalSpecification } from "@/lib/commercial-proposal";
import { normalizeProposalImage, type ProposalImageRole } from "@/lib/proposal-pdf-image";
import { database } from "@/lib/server-runtime";
import { isLegacyNorrBrand, PROPOSAL_BRAND, PROPOSAL_SELECTION_MODULE } from "@/lib/proposal-brand";

type ProposalProduct = {
  source?: "catalog" | "reference"; objectIds?: string[]; quantity?: number; name?: string; image?: string;
  referenceName?: string; referenceArticle?: string; referenceImage?: string; referencePrice?: number;
  referenceCategory?: string; referenceHeightMm?: number | null; width?: number; depth?: number; height?: number;
  price?: number; notes?: string; article?: string; category?: string; brand?: string; configuration?: string;
  option?: string; subtype?: string; color?: string; characteristics?: string[];
};
type ProposalDocument = {
  clientName?: string; projectName?: string; offerNumber?: string; offerDate?: string; validUntil?: string;
  selectionCount?: string; categories?: string; principle?: string; cityObject?: string; summaryNote?: string;
  leadTime?: string; delivery?: string; payment?: string; managerRole?: string; managerPhone?: string; managerEmail?: string;
};
type ProposalBody = {
  projectId?: string; projectName?: string; coverImage?: string; coverBrandAsset?: string; managerBrandAsset?: string; withPrices?: boolean;
  products?: ProposalProduct[]; document?: ProposalDocument; managerName?: string;
};
type PreparedImage = { data: string; width: number; height: number };

const W = 11.6929;
const H = 8.2677;
const INK = "1A1917";
const MUTED = "8D8276";
const PALE = "F3F0EA";
const IVORY = "F7F5F1";
const BURGUNDY = "6E242A";
const LINE = "DDD6CB";
const WHITE = "FFFFFF";
const asText = (value: unknown, fallback = "—") => String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
const money = (value?: number) => value && Number.isFinite(value) ? `${new Intl.NumberFormat("ru-RU").format(value)} руб.` : "Цена по запросу";
const cm = (value?: number | null) => value && Number.isFinite(value) ? String(Math.round(value / 10)) : "";

async function prepareImage(source: string | undefined, role: ProposalImageRole): Promise<PreparedImage | null> {
  if (!source) return null;
  const image = await normalizeProposalImage(source, role);
  const metadata = await sharp(image.bytes).metadata();
  return {
    data: `data:image/${image.format === "png" ? "png" : "jpeg"};base64,${Buffer.from(image.bytes).toString("base64")}`,
    width: metadata.width || 1,
    height: metadata.height || 1,
  };
}

function contain(image: PreparedImage, box: { x: number; y: number; w: number; h: number }) {
  const scale = Math.min(box.w / image.width, box.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return { data: image.data, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function coverImage(image: PreparedImage, box: { x: number; y: number; w: number; h: number }) {
  return { data: image.data, x: box.x, y: box.y, w: box.w, h: box.h, sizing: { type: "cover" as const, w: box.w, h: box.h } };
}

function addText(slide: PptxGenJS.Slide, text: string, x: number, y: number, w: number, h: number, options: PptxGenJS.TextPropsOptions = {}) {
  slide.addText(text, { x, y, w, h, fontFace: "Arial", fontSize: 10, color: INK, margin: 0, breakLine: false, fit: "shrink", ...options });
}

function addMarker(pptx: PptxGenJS, slide: PptxGenJS.Slide, number: string, title: string) {
  addText(slide, number, .5, .35, .35, .2, { fontSize: 7, bold: true, color: BURGUNDY, charSpacing: 2 });
  slide.addShape(pptx.ShapeType.line, { x: .96, y: .46, w: .48, h: 0, line: { color: BURGUNDY, width: 1.2 } });
  addText(slide, title.toUpperCase(), 1.58, .34, 3.4, .22, { fontSize: 7, color: MUTED, charSpacing: 1.8, bold: true });
}

function addChrome(pptx: PptxGenJS, slide: PptxGenJS.Slide, number: string, title: string) {
  addMarker(pptx, slide, number, title);
  addText(slide, PROPOSAL_BRAND.domain, 9.05, 7.88, 2.14, .2, { fontSize: 6, color: MUTED, charSpacing: 1.8, align: "right" });
}

function addLabelValue(slide: PptxGenJS.Slide, label: string, value: string, x: number, y: number, w: number, valueSize = 11) {
  addText(slide, label.toUpperCase(), x, y, w, .2, { fontSize: 6.5, bold: true, color: BURGUNDY, charSpacing: 1.6 });
  addText(slide, asText(value), x, y + .23, w, .48, { fontSize: valueSize, valign: "top" });
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(request);
    if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
    const body = await request.json() as ProposalBody;
    const products = Array.isArray(body.products) ? body.products.slice(0, 40) : [];
    if (!body.coverImage) return Response.json({ error: "Нет изображения визуализации." }, { status: 400 });
    if (!products.length) return Response.json({ error: "В проекте нет товаров для коммерческого предложения." }, { status: 400 });
    if (!body.projectId || !/^[a-zA-Z0-9-]{12,100}$/.test(body.projectId)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
    const project = await database.prepare("SELECT state_json FROM projects WHERE id = ? AND tenant_id = ? AND user_id = ?")
      .bind(body.projectId, user.tenantId, user.id).first<{ state_json: string | null }>();
    if (!project?.state_json) return Response.json({ error: "Сохранённый проект не найден." }, { status: 404 });
    const savedState = JSON.parse(project.state_json) as { planItems?: Array<{ id?: string }>; proposalItems?: Array<{ id?: string }>; proposalHistoryId?: string | null; historyVersions?: Array<{ id?: string; proposalItems?: Array<{ id?: string }> }> };
    const selectedHistoryItems = savedState.proposalHistoryId
      ? savedState.historyVersions?.find((version) => version.id === savedState.proposalHistoryId)?.proposalItems || []
      : null;
    const allowedIds = new Set((selectedHistoryItems || [...(savedState.planItems || []), ...(savedState.proposalItems || [])]).map((item) => item.id).filter((id): id is string => Boolean(id)));
    if (products.some((product) => !product.objectIds?.length || product.objectIds.some((id) => !allowedIds.has(id)))) {
      return Response.json({ error: "Состав коммерческого предложения не соответствует проекту." }, { status: 403 });
    }

    const proposal = body.document || {};
    const [visual, coverBrand, managerBrand, ...productImages] = await Promise.all([
      prepareImage(body.coverImage, "visualization"),
      prepareImage(body.coverBrandAsset, "cover"),
      prepareImage(body.managerBrandAsset, "cover"),
      ...products.map((product) => prepareImage(product.referenceImage || product.image, product.source === "reference" ? "reference" : "catalog")),
    ]);
    if (!visual || !coverBrand || !managerBrand) throw new Error("Не удалось подготовить изображения для PPTX.");

    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "A4_LANDSCAPE", width: W, height: H });
    pptx.layout = "A4_LANDSCAPE";
    pptx.author = PROPOSAL_BRAND.contactDomain;
    pptx.company = PROPOSAL_BRAND.contactDomain;
    pptx.subject = "Коммерческое предложение";
    pptx.title = `Коммерческое предложение — ${asText(body.projectName, PROPOSAL_BRAND.domain)}`;
    pptx.theme = { headFontFace: "Georgia", bodyFontFace: "Arial" };

    const cover = pptx.addSlide();
    cover.background = { color: IVORY };
    cover.addImage({ ...contain(coverBrand, { x: 0, y: 0, w: 6.63, h: H }) });
    cover.addShape(pptx.ShapeType.line, { x: 7.28, y: 1.12, w: .36, h: 0, line: { color: BURGUNDY, width: 1.2 } });
    addText(cover, "Коммерческое\nпредложение", 7.28, 1.74, 3.7, 1.15, { fontFace: "Georgia", fontSize: 28, breakLine: true, valign: "middle" });
    addText(cover, "Интерьер, собранный вокруг вашей жизни.", 7.28, 3.05, 3.65, .35, { fontFace: "Georgia", italic: true, fontSize: 11, color: MUTED });
    addLabelValue(cover, "Клиент", asText(proposal.clientName), 7.28, 3.62, 3.5, 12);
    addLabelValue(cover, "Проект", asText(proposal.projectName), 7.28, 4.35, 3.5, 12);
    addLabelValue(cover, "Предложение", asText(proposal.offerNumber), 7.28, 5.08, 1.5, 10);
    addLabelValue(cover, "Дата", asText(proposal.offerDate), 9.05, 5.08, 1.5, 10);
    addText(cover, `Действительно до ${asText(proposal.validUntil)}`, 7.28, 5.82, 3.5, .25, { fontSize: 8, color: MUTED });
    addText(cover, PROPOSAL_BRAND.domain, 9.05, 7.78, 1.82, .2, { fontSize: 5.5, color: MUTED, charSpacing: 1.8, align: "right" });

    const selection = pptx.addSlide();
    selection.background = { color: WHITE };
    addChrome(pptx, selection, "01", "Подборка для вашего пространства");
    addText(selection, "Собрано в единую интерьерную историю", .5, .82, 10.6, .36, { fontFace: "Georgia", fontSize: 25 });
    addText(selection, "Мы объединили мебель, свет и фактуры так, чтобы каждая позиция работала на общий сценарий пространства.", .5, 1.23, 10.45, .18, { fontSize: 8.5, color: MUTED });
    const selectionBox = PROPOSAL_SELECTION_MODULE.pptx;
    selection.addImage(coverImage(visual, { x: selectionBox.x, y: selectionBox.y, w: selectionBox.imageWidth, h: selectionBox.height }));
    selection.addShape(pptx.ShapeType.rect, { x: selectionBox.x + selectionBox.imageWidth, y: selectionBox.y, w: selectionBox.panelWidth, h: selectionBox.height, line: { color: PALE, transparency: 100 }, fill: { color: PALE } });
    addText(selection, "ВАША ПОДБОРКА", 7.35, 2.3, 2.4, .25, { fontSize: 8, bold: true, color: BURGUNDY, charSpacing: 2, align: "center" });
    addLabelValue(selection, "Количество предметов", asText(proposal.selectionCount), 6.08, 2.88, 4.55, 20);
    addLabelValue(selection, "Категории", asText(proposal.categories), 6.08, 3.75, 4.55, 11);
    addLabelValue(selection, "Принцип", asText(proposal.principle), 6.08, 4.65, 4.55, 11);
    addLabelValue(selection, "Город / объект", asText(proposal.cityObject), 6.08, 5.55, 4.55, 11);

    products.forEach((product, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: WHITE };
      addChrome(pptx, slide, String(index + 2).padStart(2, "0"), "");
      const category = asText(product.category || product.referenceCategory, "Предмет интерьера").toUpperCase();
      addText(slide, category, 4.55, .33, 2.6, .22, { fontSize: 7, bold: true, color: MUTED, charSpacing: 1.8, align: "center" });
      addText(slide, asText(product.name || product.referenceName, "Товар"), .5, .8, 10.65, .58, { fontFace: "Georgia", fontSize: 26 });
      const brand = asText(product.brand, "");
      if (brand && !isLegacyNorrBrand(brand)) addText(slide, brand, .5, 1.34, 5.3, .22, { fontSize: 7, bold: true, color: BURGUNDY, charSpacing: 2 });
      const image = productImages[index];
      if (image) slide.addImage({ ...contain(image, { x: .62, y: 1.75, w: 5.23, h: 3.76 }) });
      slide.addShape(pptx.ShapeType.rect, { x: 5.85, y: 1.75, w: 5.34, h: 3.76, line: { color: PALE, transparency: 100 }, fill: { color: PALE } });
      const details: Array<[string, string]> = [
        ["Габариты", [cm(product.width), cm(product.depth), cm(product.height || product.referenceHeightMm)].filter(Boolean).join(" × ") + " см"],
        ["Конфигурация", asText(product.configuration)],
        ["Обивка / вариант", asText(product.option)],
        ["Артикул", asText(product.article || product.referenceArticle)],
      ];
      details.forEach(([label, value], detailIndex) => addLabelValue(slide, label, value, 6.08, 2.08 + detailIndex * .62, 4.55, 10));
      addText(slide, "ДОПОЛНИТЕЛЬНЫЕ ХАРАКТЕРИСТИКИ", 6.08, 4.58, 4.55, .2, { fontSize: 6.5, bold: true, color: BURGUNDY, charSpacing: 1.6 });
      addText(slide, (product.characteristics || []).filter(Boolean).join("\n") || "Заполняется менеджером", 6.08, 4.82, 4.55, .55, { fontSize: 7.5, color: MUTED, breakLine: true });
      slide.addShape(pptx.ShapeType.line, { x: .5, y: 5.88, w: 10.65, h: 0, line: { color: LINE, width: .7 } });
      addLabelValue(slide, "Комплектация", asText(product.configuration), .62, 6.08, 3.2, 10);
      addLabelValue(slide, "Количество", `${product.quantity || 1} шт.`, 4.17, 6.08, 2.2, 10);
      addLabelValue(slide, "Стоимость", body.withPrices ? money(product.price ?? product.referencePrice) : "Цена по запросу", 7.6, 6.08, 3.2, 18);
      addText(slide, asText(product.notes, "Финальная стоимость зависит от ткани, отделки и выбранной конфигурации."), .5, 7.08, 10.65, .35, { fontSize: 7, color: MUTED });
    });

    const total = products.reduce((sum, product) => sum + (product.price ?? product.referencePrice ?? 0) * (product.quantity || 1), 0);
    const specificationPages = paginateProposalSpecification(products);
    let offset = 0;
    specificationPages.forEach((pageProducts, pageIndex) => {
      const finalPage = pageIndex === specificationPages.length - 1;
      const slide = pptx.addSlide();
      slide.background = { color: WHITE };
      addChrome(pptx, slide, String(products.length + 2 + pageIndex).padStart(2, "0"), finalPage ? "Итог и условия" : "Спецификация");
      addText(slide, pageIndex ? "Спецификация — продолжение" : "Спецификация", .5, .82, 7.5, .48, { fontFace: "Georgia", fontSize: 27 });
      const header = ["№", "ПОЗИЦИЯ", "АРТИКУЛ", "КОЛ-ВО", "ЦЕНА", "СУММА"].map((text) => ({ text, options: { bold: true, color: WHITE, fill: { color: INK } } }));
      const rows = pageProducts.map((product, index) => [
        String(offset + index + 1).padStart(2, "0"), asText(product.name), asText(product.article || product.referenceArticle), String(product.quantity || 1),
        body.withPrices ? money(product.price) : "по запросу", body.withPrices && product.price ? money(product.price * (product.quantity || 1)) : "по запросу",
      ].map((text) => ({ text })));
      slide.addTable([header, ...rows], { x: .5, y: 1.48, w: 10.65, colW: [.42, 4.15, 1.55, .85, 1.75, 1.93], rowH: [.38, ...rows.map(() => .42)], fontFace: "Arial", fontSize: 8, color: INK, margin: .08, border: { type: "solid", color: LINE, pt: .5 }, valign: "middle" });
      offset += pageProducts.length;
      if (!finalPage) return;
      addLabelValue(slide, "Итого известных позиций", asText(proposal.summaryNote), .58, 4.35, 4.85, 9);
      slide.addShape(pptx.ShapeType.rect, { x: 5.85, y: 4.25, w: 5.27, h: .92, line: { color: PALE, transparency: 100 }, fill: { color: PALE } });
      addLabelValue(slide, "Предварительный итог", body.withPrices && total ? money(total) : "Цена по запросу", 6.08, 4.42, 4.6, 19);
      addText(slide, "Условия предложения", .58, 5.48, 4.2, .35, { fontFace: "Georgia", fontSize: 18 });
      ([ ["СРОК ПОСТАВКИ", proposal.leadTime], ["ДОСТАВКА И СБОРКА", proposal.delivery], ["ОПЛАТА", proposal.payment] ] as Array<[string, string | undefined]>).forEach(([label, value], index) => {
        const x = .58 + index * 3.52;
        slide.addShape(pptx.ShapeType.rect, { x, y: 5.98, w: 3.33, h: 1.28, line: { color: PALE, transparency: 100 }, fill: { color: PALE } });
        addLabelValue(slide, label, asText(value), x + .18, 6.18, 2.95, 9);
      });
    });

    const about = pptx.addSlide();
    about.background = { color: WHITE };
    addChrome(pptx, about, String(products.length + 2 + specificationPages.length).padStart(2, "0"), PROPOSAL_BRAND.aboutTitle);
    addText(about, "Европейский дизайн. Индивидуальный сценарий.", .58, .82, 10.55, .55, { fontFace: "Georgia", fontSize: 26 });
    about.addImage({ ...contain(visual, { x: .62, y: 1.65, w: 5.23, h: 2.85 }) });
    about.addShape(pptx.ShapeType.rect, { x: 5.85, y: 1.65, w: 5.34, h: 2.85, line: { color: INK }, fill: { color: INK } });
    addText(about, PROPOSAL_BRAND.aboutLabel, 6.08, 2.02, 4.6, .22, { fontSize: 7, bold: true, color: "C88B8F", charSpacing: 2 });
    addText(about, "Интерьер начинается не с отдельного предмета, а с ощущения, которое вы хотите сохранить.", 6.08, 2.55, 4.45, 1.05, { fontFace: "Georgia", fontSize: 17, color: WHITE });
    addText(about, "Мы соединяем мебель, свет и фактуры в цельный сценарий — спокойный, точный и персональный.", 6.08, 3.68, 4.45, .55, { fontSize: 9, color: LINE });
    addText(about, "Сервис вокруг вашего проекта", .58, 4.85, 5.2, .38, { fontFace: "Georgia", fontSize: 18 });
    const benefits = [["Персональная конфигурация", "Размеры, модули, ткани и отделки подбираются под ваш интерьер."], ["Дизайнерская поддержка", "Профессиональная консультация и визуализация помогают принять решение."], ["Единый сервис", "Заказ, доставка и сборка сопровождаются одним менеджером."], ["Материалы вживую", "Финальный выбор можно подтвердить в шоуруме."]];
    benefits.forEach(([title, description], index) => { const x = .58 + index * 2.68; addText(about, String(index + 1).padStart(2, "0"), x, 5.48, .3, .2, { fontSize: 7, bold: true, color: BURGUNDY }); addText(about, title, x + .35, 5.43, 2.15, .35, { fontFace: "Georgia", fontSize: 11, bold: true }); addText(about, description, x, 5.93, 2.42, .72, { fontSize: 8, color: MUTED }); });

    const manager = pptx.addSlide();
    manager.background = { color: IVORY };
    addMarker(pptx, manager, String(products.length + 3 + specificationPages.length).padStart(2, "0"), "Ваш персональный менеджер");
    manager.addImage({ ...contain(managerBrand, { x: .82, y: 1.02, w: 4.92, h: 4.25 }) });
    addText(manager, "СЛЕДУЮЩИЙ ШАГ", .58, 5.52, 3.8, .22, { fontSize: 7, bold: true, color: BURGUNDY, charSpacing: 1.8 });
    addText(manager, "Подтвердите выбранные позиции или пришлите правки. Менеджер обновит конфигурации, стоимость и сценарий поставки.", .58, 5.92, 4.85, .75, { fontSize: 10 });
    manager.addShape(pptx.ShapeType.rect, { x: 6.35, y: 1.18, w: 4.48, h: 6.1, line: { color: LINE, width: .7 }, fill: { color: "EEE9E2" } });
    manager.addShape(pptx.ShapeType.ellipse, { x: 6.68, y: 1.68, w: .72, h: .72, line: { color: INK }, fill: { color: INK } });
    const initials = asText(body.managerName, "ИФ").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    addText(manager, initials, 6.68, 1.9, .72, .22, { fontFace: "Georgia", fontSize: 12, bold: true, color: WHITE, align: "center" });
    addText(manager, asText(body.managerName, "Имя Фамилия"), 7.58, 1.62, 2.8, .42, { fontFace: "Georgia", fontSize: 20 });
    addText(manager, asText(proposal.managerRole, "Персональный менеджер"), 7.58, 2.12, 2.8, .3, { fontSize: 9, color: MUTED });
    addLabelValue(manager, "Телефон", asText(proposal.managerPhone), 6.68, 3.0, 3.7, 11);
    addLabelValue(manager, "Email", asText(proposal.managerEmail), 6.68, 3.88, 3.7, 11);
    addLabelValue(manager, "Сайт", PROPOSAL_BRAND.contactDomain, 6.68, 4.76, 3.7, 11);
    addText(manager, "Я помогу уточнить конфигурации, проверить образцы и довести заказ до установки.", 6.68, 5.85, 3.7, .75, { fontFace: "Georgia", italic: true, fontSize: 10, color: MUTED });
    addText(manager, PROPOSAL_BRAND.managerThanks, 6.68, 6.82, 3.7, .2, { fontSize: 6, bold: true, color: MUTED, charSpacing: 1.2 });

    const output = await pptx.write({ outputType: "nodebuffer" });
    const bytes = output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer);
    const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(payload, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": "attachment; filename=\"NORR_Mobler_Commercial_Proposal.pptx\"",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать PPTX." }, { status: 500 });
  }
}
