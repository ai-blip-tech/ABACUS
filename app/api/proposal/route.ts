import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFImage, PDFFont, rgb } from "pdf-lib";
import { normalizeProposalImage, type ProposalImageRole } from "@/lib/proposal-pdf-image";
import { requireTenantUser } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

type ProductParameter = { name?: string; value?: string };
type ProposalProduct = {
  source?: "catalog" | "reference";
  objectIds?: string[];
  quantity?: number;
  name?: string;
  referenceName?: string;
  referenceArticle?: string;
  referenceImage?: string;
  referenceImages?: string[];
  referenceUrl?: string;
  referencePrice?: number;
  referenceOldPrice?: number;
  referenceCategory?: string;
  referenceSubtype?: string;
  referenceColor?: string;
  referenceMaterial?: string;
  referenceHeightMm?: number | null;
  referenceDescription?: string;
  referenceParameters?: ProductParameter[];
  width?: number;
  depth?: number;
  height?: number;
  price?: number;
  notes?: string;
  article?: string;
  category?: string;
  brand?: string;
  configuration?: string;
  option?: string;
  subtype?: string;
  color?: string;
  material?: string;
  characteristics?: string[];
};

type ProposalDocument = {
  clientName?: string; projectName?: string; offerNumber?: string; offerDate?: string; validUntil?: string;
  selectionCount?: string; categories?: string; principle?: string; cityObject?: string; summaryNote?: string;
  leadTime?: string; delivery?: string; payment?: string; managerRole?: string; managerPhone?: string; managerEmail?: string;
};

type ProposalBody = {
  projectId?: string;
  projectName?: string;
  proposalCoverImage?: string;
  coverImage?: string;
  coverBrandAsset?: string;
  fontData?: string;
  fontBoldData?: string;
  serifFontData?: string;
  serifItalicFontData?: string;
  serifBoldFontData?: string;
  withPrices?: boolean;
  products?: ProposalProduct[];
  document?: ProposalDocument;
  managerName?: string;
};

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const INK = rgb(26 / 255, 25 / 255, 23 / 255);
const MUTED = rgb(141 / 255, 130 / 255, 118 / 255);
const PALE = rgb(243 / 255, 240 / 255, 234 / 255);
const IVORY = rgb(247 / 255, 245 / 255, 241 / 255);
const BURGUNDY = rgb(110 / 255, 36 / 255, 42 / 255);
const WARM_LINE = rgb(221 / 255, 214 / 255, 203 / 255);
const STONE = rgb(203 / 255, 195 / 255, 184 / 255);
const BROWN = INK;
const WHITE = rgb(1, 1, 1);

const asText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const formatPrice = (value?: number) => value && Number.isFinite(value)
  ? `${new Intl.NumberFormat("ru-RU").format(value)} руб.`
  : "Цена по запросу";

const decodeDataUrl = (source: string) => {
  const match = source.match(/^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const payload = match[2] || "";
  return {
    mime,
    bytes: source.includes(";base64,")
      ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload)),
  };
};

const embedImage = async (document: PDFDocument, source: string | undefined, role: ProposalImageRole) => {
  if (!source) return null;
  const image = await normalizeProposalImage(source, role);
  try {
    return image.format === "png" ? await document.embedPng(image.bytes) : await document.embedJpg(image.bytes);
  } catch (error) {
    console.error("[proposal-image]", {
      role,
      detectedFormat: image.detectedFormat,
      normalizationResult: image.normalized ? `converted-to-${image.format}` : "not-required",
      failureStage: "embed",
      message: error instanceof Error ? error.message : "unknown",
    });
    throw new Error(`Не удалось встроить изображение ${role === "visualization" ? "визуализации" : role === "cover" ? "обложки" : role === "catalog" ? "каталожного товара" : "референсного товара"} в PDF.`);
  }
};

const drawImageContain = (page: ReturnType<PDFDocument["addPage"]>, image: PDFImage, box: { x: number; y: number; width: number; height: number }) => {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height });
};

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 8) => {
  const words = asText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines.at(-1) || "";
    while (last && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
};

const drawLines = (page: ReturnType<PDFDocument["addPage"]>, lines: string[], options: { x: number; y: number; font: PDFFont; size: number; lineHeight: number; color?: ReturnType<typeof rgb> }) => {
  lines.forEach((line, index) => page.drawText(line, { x: options.x, y: options.y - index * options.lineHeight, font: options.font, size: options.size, color: options.color || BROWN }));
};

const drawMarker = (page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, number: string, title: string) => {
  page.drawText(number, { x: 35.5, y: 557, font, size: 7, color: BURGUNDY });
  page.drawLine({ start: { x: 70, y: 566 }, end: { x: 104, y: 566 }, thickness: 1.4, color: BURGUNDY });
  page.drawText(title.toUpperCase(), { x: 116, y: 557, font, size: 6.5, color: MUTED });
};

const drawPageChrome = (page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, number: string, title: string) => {
  drawMarker(page, font, number, title);
  page.drawText("NORR   /   ПЕРСОНАЛЬНАЯ ПОДБОРКА", { x: 616, y: 572, font, size: 5.2, color: MUTED });
  page.drawText("NORR möbler   •   norrmobler.ru", { x: 36, y: 18, font, size: 5.2, color: MUTED });
};

const drawLabelValue = (page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, label: string, value: string, x: number, y: number, width: number, size = 10) => {
  page.drawText(label.toUpperCase(), { x, y, font, size: 6.5, color: BURGUNDY });
  drawLines(page, wrapText(textValue(value), font, size, width, 4), { x, y: y - 16, font, size, lineHeight: size + 2, color: BROWN });
};

const textValue = (value: unknown, fallback = "—") => asText(value) || fallback;
const centimetres = (value: number | null | undefined) => value && Number.isFinite(value)
  ? String(Math.round(value / 10)) : "";

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(request);
    if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
    const body = await request.json() as ProposalBody;
    const visualisationSource = body.coverImage || "";
    const proposal = body.document || {};
    const products = Array.isArray(body.products) ? body.products.slice(0, 40) : [];
    if (!visualisationSource) return Response.json({ error: "Нет изображения визуализации." }, { status: 400 });
    if (!products.length) return Response.json({ error: "В проекте нет товаров для коммерческого предложения." }, { status: 400 });
    if (!body.projectId || !/^[a-zA-Z0-9-]{12,100}$/.test(body.projectId)) return Response.json({ error: "Некорректный проект." }, { status: 400 });
    const project = await database.prepare("SELECT state_json FROM projects WHERE id = ? AND tenant_id = ? AND user_id = ?")
      .bind(body.projectId, user.tenantId, user.id)
      .first<{ state_json: string | null }>();
    if (!project?.state_json) return Response.json({ error: "Сохранённый проект не найден." }, { status: 404 });
    const savedState = JSON.parse(project.state_json) as { planItems?: Array<{ id?: string }> };
    const allowedObjectIds = new Set((savedState.planItems || []).map((item) => item.id).filter((id): id is string => Boolean(id)));
    if (products.some((product) => !product.objectIds?.length || product.objectIds.some((id) => !allowedObjectIds.has(id)))) {
      return Response.json({ error: "Состав коммерческого предложения не соответствует проекту." }, { status: 403 });
    }

    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const inlineFont = body.fontData ? decodeDataUrl(body.fontData) : null;
    const inlineFontBold = body.fontBoldData ? decodeDataUrl(body.fontBoldData) : null;
    const inlineSerif = body.serifFontData ? decodeDataUrl(body.serifFontData) : null;
    const inlineSerifItalic = body.serifItalicFontData ? decodeDataUrl(body.serifItalicFontData) : null;
    const inlineSerifBold = body.serifBoldFontData ? decodeDataUrl(body.serifBoldFontData) : null;
    if (!inlineFont?.bytes?.length || !inlineFontBold?.bytes?.length || !inlineSerif?.bytes?.length || !inlineSerifItalic?.bytes?.length || !inlineSerifBold?.bytes?.length) throw new Error("Не удалось загрузить шрифты PDF.");
    const [font, fontBold, serif, serifItalic, serifBold] = await Promise.all([
      document.embedFont(inlineFont.bytes, { subset: true }),
      document.embedFont(inlineFontBold.bytes, { subset: true }),
      document.embedFont(inlineSerif.bytes, { subset: true }),
      document.embedFont(inlineSerifItalic.bytes, { subset: true }),
      document.embedFont(inlineSerifBold.bytes, { subset: true }),
    ]);
    const visualisation = await embedImage(document, visualisationSource, "visualization");
    if (!visualisation) throw new Error("Не удалось подготовить изображение визуализации для PDF.");
    const coverBrand = await embedImage(document, body.coverBrandAsset, "cover");
    if (!coverBrand) throw new Error("Не удалось подготовить утверждённую композицию обложки для PDF.");

    const firstPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const coverSplit = 477.5;
    firstPage.drawImage(coverBrand, { x: 0, y: 0, width: coverSplit, height: PAGE_HEIGHT });
    firstPage.drawRectangle({ x: coverSplit, y: 0, width: PAGE_WIDTH - coverSplit, height: PAGE_HEIGHT, color: IVORY });
    const coverX = 525;
    firstPage.drawText("NORR MÖBLER / PRIVATE SELECTION", { x: coverX, y: 499, font: fontBold, size: 7, color: BURGUNDY });
    firstPage.drawLine({ start: { x: coverX, y: 486 }, end: { x: coverX + 26, y: 486 }, thickness: 1.2, color: BURGUNDY });
    drawLines(firstPage, ["Коммерческое", "предложение"], { x: coverX, y: 448, font: serif, size: 26, lineHeight: 27 });
    firstPage.drawText("Интерьер, собранный вокруг вашей жизни.", { x: coverX, y: 381, font: serifItalic, size: 9.5, color: MUTED });
    drawLabelValue(firstPage, font, "Клиент", textValue(proposal.clientName), coverX, 342, 255, 11);
    drawLabelValue(firstPage, font, "Проект", textValue(proposal.projectName), coverX, 292, 255, 11);
    drawLabelValue(firstPage, font, "Предложение", textValue(proposal.offerNumber), coverX, 242, 105, 10);
    drawLabelValue(firstPage, font, "Дата", textValue(proposal.offerDate), coverX + 130, 242, 105, 10);
    firstPage.drawText(`Действительно до ${textValue(proposal.validUntil)}`, { x: coverX, y: 196, font, size: 7.5, color: MUTED });
    firstPage.drawLine({ start: { x: coverX, y: 64 }, end: { x: 783, y: 64 }, thickness: .7, color: WARM_LINE });
    firstPage.drawText("М Е Б Е Л Ь   •   С В Е Т   •   Д Е К О Р", { x: coverX, y: 43, font, size: 5.2, color: MUTED });
    firstPage.drawText("N O R R M O B L E R . R U", { x: 689, y: 18, font, size: 5.2, color: MUTED });

    const visualisationPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageChrome(visualisationPage, font, "01", "Подборка для вашего пространства");
    visualisationPage.drawText("Собрано в единую интерьерную историю", { x: 36, y: 520, font: serif, size: 25, color: BROWN });
    visualisationPage.drawText("Мы объединили мебель, свет и фактуры так, чтобы каждая позиция работала не отдельно, а на общий сценарий пространства.", { x: 36, y: 493, font, size: 8.5, color: MUTED });
    drawImageContain(visualisationPage, visualisation, { x: 44.5, y: 189, width: 376.5, height: 300.5 });
    visualisationPage.drawRectangle({ x: 421, y: 189, width: 385, height: 300.5, color: PALE });
    const selectionPanelX = 438;
    drawLabelValue(visualisationPage, font, "Ваша подборка", textValue(proposal.selectionCount), selectionPanelX, 455, 330, 18);
    drawLabelValue(visualisationPage, font, "Категории", textValue(proposal.categories).replace(/,\s*/g, "\n"), selectionPanelX, 392, 330, 9);
    drawLabelValue(visualisationPage, font, "Принцип", textValue(proposal.principle), selectionPanelX, 318, 330, 9);
    drawLabelValue(visualisationPage, font, "Город / объект", textValue(proposal.cityObject), selectionPanelX, 246, 330, 9);

    const embeddedProductImages = await Promise.all(products.map(async (product) => {
      const images = [product.referenceImage, ...(product.referenceImages || []).filter((source) => source && source !== product.referenceImage)];
      const role: ProposalImageRole = product.source === "reference" ? "reference" : "catalog";
      return Promise.all([embedImage(document, images[0], role), embedImage(document, images[1], role)]);
    }));

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageChrome(page, font, String(index + 2).padStart(2, "0"), "");
      const category = textValue(product.category || product.referenceCategory, "Предмет интерьера").toUpperCase();
      page.drawText(category, { x: (PAGE_WIDTH - font.widthOfTextAtSize(category, 7)) / 2, y: 563, font, size: 7, color: MUTED });
      const name = asText(product.referenceName || product.name || "Товар");
      const isLamp = /свет|ламп|торшер/i.test(`${category} ${name}`);
      const isRug = /ковр|фактур|шкур/i.test(`${category} ${name}`);
      const brand = textValue(product.brand, isLamp ? "SEYVAA PARIS" : isRug ? "NORR CARPETS" : "NORR MÖBLER SELECTION");
      drawLines(page, wrapText(name, serif, 25, 700, 2), { x: 36, y: 520, font: serif, size: 25, lineHeight: 27 });
      page.drawText(brand, { x: 36, y: 488, font: fontBold, size: 7, color: BURGUNDY });

      const [mainImage, secondaryImage] = embeddedProductImages[index];
      if (mainImage) drawImageContain(page, mainImage, { x: 44.5, y: 230, width: 376.5, height: 271.5 });
      if (secondaryImage) drawImageContain(page, secondaryImage, { x: 304, y: 240, width: 106, height: 80 });
      if (!mainImage && !secondaryImage) {
        page.drawRectangle({ x: 44.5, y: 230, width: 376.5, height: 271.5, color: rgb(.98, .98, .98), borderColor: WARM_LINE, borderWidth: 1 });
      }
      page.drawRectangle({ x: 421, y: 230, width: 385, height: 271.5, color: PALE });
      const panelX = 438;
      let fieldY = 472;
      const panelFields: Array<[string, string]> = isLamp
        ? [["Артикул", textValue(product.article || product.referenceArticle)], ["Габариты", [product.width, product.depth, product.height || product.referenceHeightMm].map(centimetres).filter(Boolean).join(" × ") + " см"], ["Тип", textValue(product.subtype || product.referenceSubtype || product.configuration)], ["Цвет / версия", textValue(product.color || product.referenceColor || product.option)]]
        : isRug
          ? [["Артикул", textValue(product.article || product.referenceArticle)], ["Габариты", [product.width, product.depth].map(centimetres).filter(Boolean).join(" × ") + " см"], ["Тип", textValue(product.subtype || product.referenceSubtype || product.configuration)], ["Рисунок", textValue(product.color || product.referenceColor || product.option)]]
          : [["Габариты", [product.width, product.depth, product.height || product.referenceHeightMm].map(centimetres).filter(Boolean).join(" × ") + " см"], ["Конфигурация", textValue(product.configuration)], ["Обивка", textValue(product.option)], ["Артикул", textValue(product.article || product.referenceArticle)]];
      for (const [label, value] of panelFields) { drawLabelValue(page, font, label, value, panelX, fieldY, 330, 8.5); fieldY -= 39; }
      page.drawText("ДОПОЛНИТЕЛЬНЫЕ ХАРАКТЕРИСТИКИ", { x: panelX, y: 305, font: fontBold, size: 6.2, color: BURGUNDY });
      page.drawText("заполняется менеджером", { x: panelX, y: 294, font: serifItalic, size: 5.4, color: MUTED });
      for (let line = 0; line < 4; line += 1) page.drawLine({ start: { x: panelX, y: 282 - line * 12 }, end: { x: 565, y: 282 - line * 12 }, thickness: .7, color: BURGUNDY });
      const unitPrice = product.price ?? product.referencePrice;
      [["Комплектация", textValue(product.configuration)], ["Количество", `${String(product.quantity || 1)} шт.`], ["Стоимость", body.withPrices ? formatPrice(unitPrice) : "Цена по запросу"]].forEach(([label, value], column) => {
        const x = 36 + column * 257;
        page.drawText(label.toUpperCase(), { x: x + 10, y: 194, font: fontBold, size: 6.3, color: BURGUNDY });
        page.drawText(value, { x: x + 10, y: 176, font: column === 2 ? serif : font, size: column === 2 ? 15 : 9, color: BROWN });
        page.drawLine({ start: { x, y: 205 }, end: { x: x + 257, y: 205 }, thickness: .7, color: WARM_LINE });
      });
      drawLines(page, wrapText(textValue(product.notes || product.referenceDescription, "Финальная стоимость зависит от ткани, отделки и выбранной конфигурации."), font, 6.5, 740, 2), { x: 36, y: 150, font, size: 6.5, lineHeight: 8, color: MUTED });
    }

    const total = products.reduce((sum, product) => sum + (product.price ?? product.referencePrice ?? 0) * (product.quantity || 1), 0);
    const summary = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageChrome(summary, font, "05", "Итог и условия");
    summary.drawText("Спецификация", { x: 36, y: 520, font: serif, size: 27, color: BROWN });
    const columns = [42, 72, 370, 490, 555, 660];
    summary.drawRectangle({ x: 36, y: 468, width: 764, height: 28, color: INK });
    ["№", "ПОЗИЦИЯ", "АРТИКУЛ", "КОЛ-ВО", "ЦЕНА", "СУММА"].forEach((value, index) => summary.drawText(value, { x: columns[index], y: 480, font: fontBold, size: 7, color: WHITE }));
    products.forEach((product, index) => {
      const y = 442 - index * 34;
      const row = [String(index + 1).padStart(2, "0"), textValue(product.name), textValue(product.article || product.referenceArticle), String(product.quantity || 1), body.withPrices ? formatPrice(product.price) : "по запросу", body.withPrices && product.price ? formatPrice(product.price * (product.quantity || 1)) : "по запросу"];
      if (index % 2 === 1) summary.drawRectangle({ x: 36, y: y - 11, width: 764, height: 33, color: rgb(248 / 255, 246 / 255, 242 / 255) });
      row.forEach((value, column) => summary.drawText(value.slice(0, column === 1 ? 40 : 20), { x: columns[column], y, font: column === 0 || column === 5 ? fontBold : font, size: 8, color: BROWN }));
      summary.drawLine({ start: { x: 36, y: y - 10 }, end: { x: 800, y: y - 10 }, thickness: .5, color: WARM_LINE });
    });
    const summaryY = Math.max(250, 404 - products.length * 34);
    summary.drawText("ИТОГО ИЗВЕСТНЫХ ПОЗИЦИЙ", { x: 42, y: summaryY + 18, font: fontBold, size: 6.5, color: BURGUNDY });
    drawLines(summary, wrapText(textValue(proposal.summaryNote), font, 8, 365, 3), { x: 42, y: summaryY, font, size: 8, lineHeight: 10, color: MUTED });
    const totalText = body.withPrices && total ? formatPrice(total) : "Цена по запросу";
    summary.drawRectangle({ x: 421, y: summaryY - 26, width: 379, height: 65, color: PALE });
    summary.drawText("ПРЕДВАРИТЕЛЬНЫЙ ИТОГ", { x: 438, y: summaryY + 18, font: fontBold, size: 7, color: BURGUNDY });
    summary.drawText(totalText, { x: 438, y: summaryY - 10, font: serif, size: 19, color: BROWN });
    summary.drawText("Условия предложения", { x: 42, y: 215, font: serif, size: 17, color: BROWN });
    [["СРОК ПОСТАВКИ", proposal.leadTime], ["ДОСТАВКА И СБОРКА", proposal.delivery], ["ОПЛАТА", proposal.payment]].forEach(([label, value], index) => {
      const x = 42 + index * 253; summary.drawRectangle({ x, y: 92, width: 235, height: 92, color: PALE });
      if (index) summary.drawLine({ start: { x, y: 106 }, end: { x, y: 170 }, thickness: .5, color: WARM_LINE });
      summary.drawText(label!, { x: x + 14, y: 160, font: fontBold, size: 7, color: BURGUNDY });
      drawLines(summary, wrapText(textValue(value), font, 8.5, 205, 4), { x: x + 14, y: 139, font, size: 8.5, lineHeight: 11 });
    });
    summary.drawText("Финальные характеристики, стоимость, сроки и условия фиксируются в счёте и договоре после согласования всех опций.", { x: 42, y: 76, font, size: 5.5, color: MUTED });

    const about = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageChrome(about, font, "06", "О NORR möbler");
    about.drawText("Европейский дизайн. Индивидуальный сценарий.", { x: 42, y: 516, font: serif, size: 25, color: BROWN });
    drawImageContain(about, visualisation, { x: 44.5, y: 300, width: 376.5, height: 205 });
    about.drawRectangle({ x: 421, y: 300, width: 385, height: 205, color: INK });
    about.drawText("NORR MÖBLER", { x: 438, y: 476, font: fontBold, size: 6.5, color: BURGUNDY });
    drawLines(about, wrapText("Интерьер начинается не с отдельного предмета, а с ощущения, которое вы хотите сохранить.", serif, 14, 335, 5), { x: 438, y: 448, font: serif, size: 14, lineHeight: 18, color: WHITE });
    drawLines(about, wrapText("Мы соединяем мебель, свет и фактуры в цельный сценарий - спокойный, точный и персональный.", font, 8, 335, 4), { x: 438, y: 377, font, size: 8, lineHeight: 10, color: WARM_LINE });
    about.drawText("Сервис вокруг вашего проекта", { x: 42, y: 270, font: serif, size: 17, color: BROWN });
    const benefits = [
      ["Персональная конфигурация", "Размеры, модули, ткани и отделки подбираются под ваш интерьер."],
      ["Дизайнерская поддержка", "Профессиональная консультация, 3D-модели и визуализация помогают принять решение."],
      ["Единый сервис", "Согласование, заказ, доставка и сборка сопровождаются одним менеджером."],
      ["Материалы вживую", "Финальный выбор можно подтвердить в шоуруме по реальным образцам."],
    ];
    benefits.forEach(([title, description], index) => {
      const x = 42 + index * 190;
      if (index) about.drawLine({ start: { x: x - 10, y: 175 }, end: { x: x - 10, y: 250 }, thickness: .5, color: WARM_LINE });
      about.drawText(String(index + 1).padStart(2, "0"), { x, y: 238, font: fontBold, size: 7, color: BURGUNDY });
      drawLines(about, wrapText(title, serif, 10, 165, 2), { x: x + 16, y: 238, font: serif, size: 10, lineHeight: 11 });
      drawLines(about, wrapText(description, font, 6.6, 165, 4), { x, y: 209, font, size: 6.6, lineHeight: 8, color: MUTED });
    });
    about.drawText("N O R R   /   L I V E   B E A U T I F U L L Y", { x: 615, y: 151, font, size: 4.5, color: STONE });

    const manager = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    manager.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: IVORY });
    drawPageChrome(manager, font, "07", "Ваш персональный менеджер");
    manager.drawEllipse({ x: 238, y: 350, xScale: 145, yScale: 145, borderColor: WARM_LINE, borderWidth: 1 });
    const managerArc = (t: number) => {
      const angle = Math.PI * (1.18 + .64 * t);
      return { x: 238 + 160 * Math.cos(angle), y: 350 - 160 * Math.sin(angle) };
    };
    for (let segment = 0; segment < 32; segment += 1) manager.drawLine({ start: managerArc(segment / 32), end: managerArc((segment + 1) / 32), thickness: 1.2, color: BURGUNDY });
    manager.drawText("NORR", { x: 176, y: 360, font: serif, size: 38, color: STONE });
    manager.drawText("M Ö B L E R", { x: 210, y: 332, font: fontBold, size: 6, color: MUTED });
    manager.drawLine({ start: { x: 208, y: 310 }, end: { x: 268, y: 310 }, thickness: 1, color: BURGUNDY });
    manager.drawText("Е В Р О П Е Й С К И Е   И Н Т Е Р Ь Е Р Ы", { x: 178, y: 288, font, size: 4.5, color: MUTED });
    manager.drawLine({ start: { x: 42, y: 159 }, end: { x: 63, y: 159 }, thickness: 1, color: BURGUNDY });
    manager.drawText("СЛЕДУЮЩИЙ ШАГ", { x: 42, y: 140, font: fontBold, size: 7, color: BURGUNDY });
    drawLines(manager, wrapText("Подтвердите выбранные позиции или пришлите правки. Менеджер обновит конфигурации, стоимость и сценарий поставки.", font, 9, 375, 3), { x: 42, y: 118, font, size: 9, lineHeight: 12 });
    manager.drawText("Мебель, свет и декор для интерьеров, в которых хочется жить.", { x: 42, y: 68, font: serifItalic, size: 8, color: MUTED });
    manager.drawRectangle({ x: 456.5, y: 71.5, width: 324, height: 438.5, color: rgb(238 / 255, 233 / 255, 226 / 255), borderColor: WARM_LINE, borderWidth: .7 });
    manager.drawEllipse({ x: 505, y: 455, xScale: 25, yScale: 25, color: BROWN });
    manager.drawText(textValue(body.managerName, "ИФ").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), { x: 494, y: 449, font: serifBold, size: 12, color: WHITE });
    manager.drawText(textValue(body.managerName, "Имя Фамилия"), { x: 540, y: 455, font: serif, size: 20, color: BROWN });
    manager.drawText(textValue(proposal.managerRole, "Персональный менеджер"), { x: 540, y: 435, font, size: 9, color: MUTED });
    let managerY = 352;
    for (const [label, value] of [["ТЕЛЕФОН", proposal.managerPhone], ["EMAIL", proposal.managerEmail], ["САЙТ", "norrmobler.ru"]] as const) { manager.drawText(label, { x: 480, y: managerY, font: fontBold, size: 7, color: BURGUNDY }); manager.drawText(textValue(value), { x: 480, y: managerY - 20, font, size: 10, color: BROWN }); managerY -= 70; }
    manager.drawLine({ start: { x: 480, y: 151 }, end: { x: 756, y: 151 }, thickness: .6, color: WARM_LINE });
    drawLines(manager, wrapText("Я помогу уточнить конфигурации, проверить образцы и довести заказ до установки.", serifItalic, 8.5, 270, 3), { x: 480, y: 130, font: serifItalic, size: 8.5, lineHeight: 11, color: MUTED });
    manager.drawText("СПАСИБО, ЧТО ВЫБИРАЕТЕ NORR MÖBLER", { x: 480, y: 89, font: fontBold, size: 5.5, color: MUTED });
    manager.drawLine({ start: { x: 36, y: 36 }, end: { x: 806, y: 36 }, thickness: .6, color: WARM_LINE });
    manager.drawText("NORR MÖBLER", { x: 36, y: 18, font: fontBold, size: 5.5, color: MUTED });
    manager.drawText("NORRMOBLER.RU", { x: 710, y: 18, font, size: 5.5, color: MUTED });

    document.setTitle(`Коммерческое предложение — ${asText(body.projectName || "NORR mobler")}`);
    document.setAuthor("NORR mobler");
    document.setCreator("ROOM Design");
    const bytes = await document.save();
    const filename = "NORR_Mobler_Commercial_Proposal.pdf";
    const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(payload, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать PDF." }, { status: 500 });
  }
}
