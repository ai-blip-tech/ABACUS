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
  fontData?: string;
  withPrices?: boolean;
  products?: ProposalProduct[];
  document?: ProposalDocument;
  managerName?: string;
};

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const BROWN = rgb(0.17, 0.11, 0.075);
const MUTED = rgb(0.45, 0.42, 0.39);
const PALE = rgb(0.95, 0.94, 0.93);
const BURGUNDY = rgb(0.43, 0.14, 0.16);
const WARM_LINE = rgb(0.87, 0.84, 0.80);
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

const wrapAllText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const words = asText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
};

const fittedProductTitle = (text: string, font: PDFFont) => {
  for (let size = 23; size >= 15; size -= 1) {
    const lines = wrapAllText(text, font, size, 170);
    if (lines.length <= 3) return { lines, size, lineHeight: size + 3 };
  }
  return { lines: wrapAllText(text, font, 15, 170), size: 15, lineHeight: 18 };
};

const drawLines = (page: ReturnType<PDFDocument["addPage"]>, lines: string[], options: { x: number; y: number; font: PDFFont; size: number; lineHeight: number; color?: ReturnType<typeof rgb> }) => {
  lines.forEach((line, index) => page.drawText(line, { x: options.x, y: options.y - index * options.lineHeight, font: options.font, size: options.size, color: options.color || BROWN }));
};

const drawField = (page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, label: string, value: string, y: number) => {
  page.drawText(label, { x: 28, y, font, size: 8.5, color: MUTED });
  const lines = wrapText(value, font, 9.5, 132, 2);
  drawLines(page, lines, { x: 28, y: y - 13, font, size: 9.5, lineHeight: 11 });
  return y - 18 - Math.max(1, lines.length) * 11;
};

const drawMarker = (page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, number: string, title: string) => {
  page.drawText(number, { x: 42, y: 563, font, size: 8, color: BURGUNDY });
  page.drawLine({ start: { x: 70, y: 566 }, end: { x: 104, y: 566 }, thickness: 1.4, color: BURGUNDY });
  page.drawText(title.toUpperCase(), { x: 116, y: 563, font, size: 7.5, color: MUTED });
};

const textValue = (value: unknown, fallback = "—") => asText(value) || fallback;

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
    if (!inlineFont?.bytes?.length) throw new Error("Не удалось загрузить шрифт PDF.");
    const font = await document.embedFont(inlineFont.bytes, { subset: true });
    const visualisation = await embedImage(document, visualisationSource, "visualization");
    if (!visualisation) throw new Error("Не удалось подготовить изображение визуализации для PDF.");

    const firstPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    firstPage.drawRectangle({ x: 0, y: 0, width: 330, height: PAGE_HEIGHT, color: BURGUNDY });
    firstPage.drawText("NORR", { x: 66, y: 440, font, size: 54, color: WHITE });
    firstPage.drawText("MOBLER", { x: 77, y: 407, font, size: 18, color: WHITE });
    firstPage.drawText("Интерьер, собранный вокруг вашей жизни.", { x: 52, y: 70, font, size: 12, color: WHITE });
    firstPage.drawRectangle({ x: 330, y: 0, width: PAGE_WIDTH - 330, height: PAGE_HEIGHT, color: PALE });
    firstPage.drawText("NORR MOBLER / PRIVATE SELECTION", { x: 382, y: 520, font, size: 7, color: BURGUNDY });
    firstPage.drawText("КОММЕРЧЕСКОЕ", { x: 382, y: 458, font, size: 31, color: BROWN });
    firstPage.drawText("ПРЕДЛОЖЕНИЕ", { x: 382, y: 420, font, size: 31, color: BROWN });
    let coverY = 350;
    for (const [label, value] of [["КЛИЕНТ", proposal.clientName], ["ПРОЕКТ", proposal.projectName], ["ПРЕДЛОЖЕНИЕ", proposal.offerNumber], ["ДАТА", proposal.offerDate], ["ДЕЙСТВИТЕЛЬНО ДО", proposal.validUntil]] as const) {
      firstPage.drawText(label, { x: 382, y: coverY, font, size: 7, color: BURGUNDY });
      firstPage.drawText(textValue(value), { x: 382, y: coverY - 18, font, size: 12, color: BROWN });
      coverY -= 53;
    }

    const visualisationPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawMarker(visualisationPage, font, "01", "Подборка для вашего пространства");
    visualisationPage.drawText("Собрано в единую интерьерную историю", { x: 42, y: 520, font, size: 25, color: BROWN });
    visualisationPage.drawText("Мы объединили мебель, свет и фактуры в один сценарий пространства.", { x: 42, y: 492, font, size: 10, color: MUTED });
    drawImageContain(visualisationPage, visualisation, { x: 42, y: 58, width: 525, height: 405 });
    visualisationPage.drawRectangle({ x: 567, y: 58, width: 233, height: 405, color: PALE });
    let selectionY = 420;
    for (const [label, value] of [["ВАША ПОДБОРКА", proposal.selectionCount], ["КАТЕГОРИИ", proposal.categories], ["ПРИНЦИП", proposal.principle], ["ГОРОД / ОБЪЕКТ", proposal.cityObject]] as const) {
      visualisationPage.drawText(label, { x: 590, y: selectionY, font, size: 7, color: BURGUNDY });
      drawLines(visualisationPage, wrapText(textValue(value), font, 10, 185, 5), { x: 590, y: selectionY - 18, font, size: 10, lineHeight: 12 });
      selectionY -= 82;
    }

    const embeddedProductImages = await Promise.all(products.map(async (product) => {
      const images = [product.referenceImage, ...(product.referenceImages || []).filter((source) => source && source !== product.referenceImage)];
      const role: ProposalImageRole = product.source === "reference" ? "reference" : "catalog";
      return Promise.all([embedImage(document, images[0], role), embedImage(document, images[1], role)]);
    }));

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawRectangle({ x: 0, y: 0, width: 230, height: PAGE_HEIGHT, color: PALE });
      drawMarker(page, font, String(index + 2).padStart(2, "0"), textValue(product.category || product.referenceCategory, "Предмет интерьера"));
      page.drawText(textValue(product.brand, "NORR MOBLER SELECTION"), { x: 28, y: PAGE_HEIGHT - 68, font, size: 8, color: BURGUNDY });
      const name = asText(product.referenceName || product.name || "Товар");
      const title = fittedProductTitle(name, font);
      drawLines(page, title.lines, { x: 28, y: PAGE_HEIGHT - 96, font, size: title.size, lineHeight: title.lineHeight });

      let fieldY = PAGE_HEIGHT - 108 - title.lines.length * title.lineHeight;
      page.drawText("Размеры", { x: 28, y: fieldY, font, size: 13, color: BROWN });
      page.drawLine({ start: { x: 28, y: fieldY - 7 }, end: { x: 198, y: fieldY - 7 }, thickness: 0.8, color: BROWN });
      fieldY -= 25;
      if (product.width) fieldY = drawField(page, font, "Ширина", `${product.width} мм`, fieldY);
      if (product.height || product.referenceHeightMm) fieldY = drawField(page, font, "Высота", `${product.height || product.referenceHeightMm} мм`, fieldY);
      if (product.depth) fieldY = drawField(page, font, "Глубина", `${product.depth} мм`, fieldY);
      if ((product.quantity || 1) > 1) fieldY = drawField(page, font, "Количество", String(product.quantity), fieldY);
      fieldY -= 3;
      page.drawText("Характеристики", { x: 28, y: fieldY, font, size: 13, color: BROWN });
      page.drawLine({ start: { x: 28, y: fieldY - 7 }, end: { x: 198, y: fieldY - 7 }, thickness: 0.8, color: BROWN });
      fieldY -= 25;
      const fields = [
        ["Артикул", product.article || product.referenceArticle], ["Конфигурация", product.configuration],
        ["Обивка / вариант", product.option], ["Категория", product.category || product.referenceCategory],
      ] as Array<[string, string | undefined]>;
      for (const [label, value] of fields) if (value && fieldY > 72) fieldY = drawField(page, font, label, value, fieldY);
      const additional = (product.characteristics || []).filter(Boolean).slice(0, 4);
      for (const value of additional) if (fieldY > 72) fieldY = drawField(page, font, "Доп. характеристика", value, fieldY);

      const [mainImage, secondaryImage] = embeddedProductImages[index];
      if (secondaryImage) drawImageContain(page, secondaryImage, { x: 250, y: 300, width: 190, height: 255 });
      if (mainImage) drawImageContain(page, mainImage, { x: secondaryImage ? 455 : 270, y: 282, width: secondaryImage ? 355 : 520, height: 280 });
      if (!mainImage && !secondaryImage) {
        page.drawRectangle({ x: 270, y: 320, width: 520, height: 210, color: rgb(0.98, 0.98, 0.98), borderColor: rgb(0.86, 0.84, 0.82), borderWidth: 1 });
        page.drawText("Изображение товара недоступно", { x: 430, y: 420, font, size: 12, color: MUTED });
      }

      const description = asText(product.notes || product.referenceDescription);
      if (description) drawLines(page, wrapText(description, font, 12, 520, 6), { x: 270, y: 245, font, size: 12, lineHeight: 17, color: BROWN });
      if (body.withPrices) {
        const unitPrice = product.price ?? product.referencePrice;
        const price = formatPrice(unitPrice);
        page.drawText(price, { x: 790 - font.widthOfTextAtSize(price, 25), y: 48, font, size: 25, color: rgb(0.05, 0.05, 0.05) });
        if (unitPrice && (product.quantity || 1) > 1) {
          const subtotal = `Итого: ${formatPrice(unitPrice * (product.quantity || 1))}`;
          page.drawText(subtotal, { x: 790 - font.widthOfTextAtSize(subtotal, 11), y: 30, font, size: 11, color: MUTED });
        }
        if (product.referenceOldPrice && product.referenceOldPrice > (product.referencePrice || 0)) {
          const oldPrice = formatPrice(product.referenceOldPrice);
          const oldX = 790 - font.widthOfTextAtSize(oldPrice, 15);
          page.drawText(oldPrice, { x: oldX, y: 82, font, size: 15, color: rgb(0.68, 0.68, 0.68) });
          page.drawLine({ start: { x: oldX, y: 88 }, end: { x: 790, y: 88 }, thickness: 1, color: rgb(0.68, 0.68, 0.68) });
        }
      }
    }

    const total = products.reduce((sum, product) => sum + (product.price ?? product.referencePrice ?? 0) * (product.quantity || 1), 0);
    const summary = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawMarker(summary, font, "05", "Итог и условия");
    summary.drawText("Спецификация", { x: 42, y: 520, font, size: 27, color: BROWN });
    const columns = [42, 72, 370, 490, 555, 660];
    summary.drawRectangle({ x: 36, y: 468, width: 764, height: 28, color: BROWN, opacity: .98 });
    ["№", "ПОЗИЦИЯ", "АРТИКУЛ", "КОЛ-ВО", "ЦЕНА", "СУММА"].forEach((value, index) => summary.drawText(value, { x: columns[index], y: 480, font, size: 7, color: WHITE }));
    products.forEach((product, index) => {
      const y = 442 - index * 34;
      const row = [String(index + 1).padStart(2, "0"), textValue(product.name), textValue(product.article || product.referenceArticle), String(product.quantity || 1), body.withPrices ? formatPrice(product.price) : "по запросу", body.withPrices && product.price ? formatPrice(product.price * (product.quantity || 1)) : "по запросу"];
      row.forEach((value, column) => summary.drawText(value.slice(0, column === 1 ? 40 : 20), { x: columns[column], y, font, size: 8, color: BROWN }));
      summary.drawLine({ start: { x: 36, y: y - 10 }, end: { x: 800, y: y - 10 }, thickness: .5, color: WARM_LINE });
    });
    const summaryY = Math.max(228, 438 - products.length * 34);
    drawLines(summary, wrapText(textValue(proposal.summaryNote), font, 9, 470, 3), { x: 42, y: summaryY, font, size: 9, lineHeight: 12, color: MUTED });
    const totalText = body.withPrices && total ? formatPrice(total) : "Цена по запросу";
    summary.drawText("ПРЕДВАРИТЕЛЬНЫЙ ИТОГ", { x: 610, y: summaryY, font, size: 7, color: BURGUNDY });
    summary.drawText(totalText, { x: 610, y: summaryY - 26, font, size: 19, color: BROWN });
    summary.drawText("Условия предложения", { x: 42, y: 160, font, size: 17, color: BROWN });
    [["СРОК ПОСТАВКИ", proposal.leadTime], ["ДОСТАВКА И СБОРКА", proposal.delivery], ["ОПЛАТА", proposal.payment]].forEach(([label, value], index) => {
      const x = 42 + index * 253; summary.drawRectangle({ x, y: 48, width: 235, height: 92, color: PALE });
      summary.drawText(label!, { x: x + 14, y: 118, font, size: 7, color: BURGUNDY });
      drawLines(summary, wrapText(textValue(value), font, 8.5, 205, 4), { x: x + 14, y: 97, font, size: 8.5, lineHeight: 11 });
    });

    const about = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawMarker(about, font, "06", "О NORR mobler");
    about.drawText("Европейский дизайн. Индивидуальный сценарий.", { x: 42, y: 516, font, size: 25, color: BROWN });
    drawImageContain(about, visualisation, { x: 42, y: 248, width: 490, height: 230 });
    about.drawRectangle({ x: 532, y: 248, width: 268, height: 230, color: BROWN });
    drawLines(about, wrapText("Интерьер начинается не с отдельного предмета, а с ощущения, которое вы хотите сохранить.", font, 14, 220, 6), { x: 558, y: 425, font, size: 14, lineHeight: 18, color: WHITE });
    about.drawText("Сервис вокруг вашего проекта", { x: 42, y: 210, font, size: 17, color: BROWN });
    ["Персональная конфигурация", "Дизайнерская поддержка", "Единый сервис", "Материалы вживую"].forEach((value, index) => { const x = 42 + index * 190; about.drawText(String(index + 1).padStart(2, "0"), { x, y: 165, font, size: 8, color: BURGUNDY }); drawLines(about, wrapText(value, font, 11, 150, 3), { x, y: 145, font, size: 11, lineHeight: 13 }); });

    const manager = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawMarker(manager, font, "07", "Ваш персональный менеджер");
    drawImageContain(manager, visualisation, { x: 42, y: 168, width: 480, height: 340 });
    manager.drawRectangle({ x: 542, y: 64, width: 258, height: 444, color: PALE });
    manager.drawText(textValue(body.managerName, "Имя Фамилия"), { x: 570, y: 408, font, size: 22, color: BROWN });
    let managerY = 365;
    for (const [label, value] of [["ДОЛЖНОСТЬ", proposal.managerRole], ["ТЕЛЕФОН", proposal.managerPhone], ["EMAIL", proposal.managerEmail], ["САЙТ", "norrmobler.ru"]] as const) { manager.drawText(label, { x: 570, y: managerY, font, size: 7, color: BURGUNDY }); manager.drawText(textValue(value), { x: 570, y: managerY - 20, font, size: 11, color: BROWN }); managerY -= 68; }

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
