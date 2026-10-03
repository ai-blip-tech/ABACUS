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
};

type ProposalBody = {
  projectId?: string;
  projectName?: string;
  proposalCoverImage?: string;
  coverImage?: string;
  fontData?: string;
  withPrices?: boolean;
  products?: ProposalProduct[];
};

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const BROWN = rgb(0.17, 0.11, 0.075);
const MUTED = rgb(0.45, 0.42, 0.39);
const PALE = rgb(0.95, 0.94, 0.93);

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

const drawImageCover = (page: ReturnType<PDFDocument["addPage"]>, image: PDFImage) => {
  const scale = Math.max(PAGE_WIDTH / image.width, PAGE_HEIGHT / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (PAGE_WIDTH - width) / 2, y: (PAGE_HEIGHT - height) / 2, width, height });
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

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(request);
    if (!user) return Response.json({ error: "Требуется вход." }, { status: 401 });
    const body = await request.json() as ProposalBody;
    const proposalCoverSource = body.proposalCoverImage || "";
    const visualisationSource = body.coverImage || "";
    const products = Array.isArray(body.products) ? body.products.slice(0, 40) : [];
    if (!proposalCoverSource) return Response.json({ error: "Нет изображения обложки." }, { status: 400 });
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
    const [proposalCover, visualisation] = await Promise.all([
      embedImage(document, proposalCoverSource, "cover"),
      embedImage(document, visualisationSource, "visualization"),
    ]);
    if (!proposalCover) throw new Error("Не удалось подготовить изображение обложки для PDF.");
    if (!visualisation) throw new Error("Не удалось подготовить изображение визуализации для PDF.");

    const firstPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawImageCover(firstPage, proposalCover);

    const visualisationPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawImageCover(visualisationPage, visualisation);

    const embeddedProductImages = await Promise.all(products.map(async (product) => {
      const images = [product.referenceImage, ...(product.referenceImages || []).filter((source) => source && source !== product.referenceImage)];
      const role: ProposalImageRole = product.source === "reference" ? "reference" : "catalog";
      return Promise.all([embedImage(document, images[0], role), embedImage(document, images[1], role)]);
    }));

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawRectangle({ x: 0, y: 0, width: 230, height: PAGE_HEIGHT, color: PALE });
      page.drawText(String(index + 3).padStart(2, "0"), { x: 28, y: PAGE_HEIGHT - 30, font, size: 8, color: MUTED });
      page.drawText("ПРЕДМЕТ ИНТЕРЬЕРА", { x: 28, y: PAGE_HEIGHT - 68, font, size: 8, color: MUTED });
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
        ["Артикул", product.referenceArticle], ["Категория", product.referenceCategory],
        ["Тип", product.referenceSubtype], ["Материал", product.referenceMaterial], ["Цвет", product.referenceColor],
      ] as Array<[string, string | undefined]>;
      for (const [label, value] of fields) if (value && fieldY > 72) fieldY = drawField(page, font, label, value, fieldY);
      const additional = (product.referenceParameters || [])
        .filter((parameter) => parameter.name && parameter.value && !/артикул|габарит|материал|цвет|тип/i.test(parameter.name))
        .slice(0, 4);
      for (const parameter of additional) if (fieldY > 72) fieldY = drawField(page, font, asText(parameter.name), asText(parameter.value), fieldY);

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

    if (body.withPrices) {
      const total = products.reduce((sum, product) => sum + (product.price ?? product.referencePrice ?? 0) * (product.quantity || 1), 0);
      const summary = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      summary.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PALE });
      summary.drawText("ИТОГ КОММЕРЧЕСКОГО ПРЕДЛОЖЕНИЯ", { x: 48, y: PAGE_HEIGHT - 82, font, size: 13, color: MUTED });
      summary.drawText(asText(body.projectName || "ROOM design"), { x: 48, y: PAGE_HEIGHT - 132, font, size: 28, color: BROWN });
      summary.drawText(`${products.length} поз. / ${products.reduce((sum, product) => sum + (product.quantity || 1), 0)} шт.`, { x: 48, y: PAGE_HEIGHT - 175, font, size: 12, color: MUTED });
      const totalText = total ? `${new Intl.NumberFormat("ru-RU").format(total)} руб.` : "Цена по запросу";
      summary.drawText("ИТОГО", { x: 48, y: 125, font, size: 12, color: MUTED });
      summary.drawText(totalText, { x: 48, y: 70, font, size: 34, color: BROWN });
    }

    document.setTitle(`Коммерческое предложение — ${asText(body.projectName || "ROOM design")}`);
    document.setAuthor("ROOM design");
    document.setCreator("ROOM design");
    const bytes = await document.save();
    const filename = "room-design-commercial-proposal.pdf";
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
