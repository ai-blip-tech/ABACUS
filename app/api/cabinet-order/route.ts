import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nodemailer from "nodemailer";
import { CABINET_ORDER_RECIPIENT, cabinetOrderTopics, isCabinetOrderPhone } from "@/lib/cabinet-order";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024;
const emailPattern = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u;

function getMailSettings() {
  const smtpUrl = process.env.ROOM_DESIGN_ORDER_SMTP_URL;
  const from = process.env.ROOM_DESIGN_ORDER_FROM;
  return { smtpUrl, from, preview: !smtpUrl && process.env.NODE_ENV === "development" };
}

export async function HEAD() {
  const { smtpUrl, from, preview } = getMailSettings();
  return new Response(null, {
    status: preview || (smtpUrl && from) ? 204 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http" ? forwardedProtocol + ":" : url.protocol;
  if (origin !== url.origin && (!host || origin !== protocol + "//" + host)) {
    return Response.json({ error: "Откройте форму в Room Design и попробуйте ещё раз." }, { status: 403 });
  }

  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) {
    return Response.json({ error: "Не удалось прочитать данные заказа." }, { status: 400 });
  }

  let form: FormData;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty order");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return Response.json({ error: "Заявка слишком большая." }, { status: 413 });
      }
      chunks.push(value);
    }
    form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": type } }).formData();
  } catch {
    return Response.json({ error: "Не удалось прочитать данные заказа." }, { status: 400 });
  }

  const field = (key: string, max: number) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  };
  const name = field("name", 80);
  const phone = field("phone", 35);
  const email = field("email", 120);
  const product = field("productName", 150);
  if (!name || !isCabinetOrderPhone(phone)) {
    return Response.json({ error: "Укажите имя и корректный номер телефона." }, { status: 400 });
  }
  if (email && !emailPattern.test(email)) {
    return Response.json({ error: "Проверьте адрес электронной почты." }, { status: 400 });
  }
  if (!product || !field("construction", 400)) {
    return Response.json({ error: "Вернитесь в конфигуратор и выберите товар." }, { status: 400 });
  }

  const photo = form.get("photo");
  let attachment: Buffer | undefined;
  if (photo instanceof File) {
    if (photo.type !== "image/jpeg" || photo.size < 4 || photo.size > MAX_PHOTO_BYTES) {
      return Response.json({ error: "Не удалось приложить изображение товара." }, { status: 400 });
    }
    attachment = Buffer.from(await photo.arrayBuffer());
    if (attachment[0] !== 0xff || attachment[1] !== 0xd8) {
      return Response.json({ error: "Не удалось прочитать изображение товара." }, { status: 400 });
    }
  }

  const questions = cabinetOrderTopics.filter(topic => form.getAll("topics").includes(topic));
  const rows = [
    ["Имя", name], ["Телефон", phone], ["Почта", email], ["Товар", product],
    ["Ш × Г × В", field("dimensions", 100)], ["Отделка", field("finish", 2500)],
    ["Конструкция", field("construction", 400)], ["Стоимость", field("price", 120)],
    ["Желаемый срок", field("deadline", 80)], ["Ориентировочный бюджет", field("budget", 100)],
    ["Город доставки", field("city", 100)], ["Комментарий", field("note", 800)],
    ["Вопросы к фабрике", questions.join(", ")], ["Свой вопрос", field("extra", 500)],
  ];
  const { smtpUrl, from, preview } = getMailSettings();
  if (!preview && (!smtpUrl || !from)) {
    return Response.json({ error: "Отправка заказов пока недоступна. Попробуйте позже." }, { status: 503 });
  }

  const message = {
    from: from || "preview@roomdesign.com.ru",
    to: CABINET_ORDER_RECIPIENT,
    replyTo: email || undefined,
    subject: "Заказ товара · Room Design",
    text: rows.filter(([, value]) => value).map(([label, value]) => label + ": " + value).join("\n"),
    attachments: attachment ? [{ filename: "room-design-cabinet.jpg", content: attachment, contentType: "image/jpeg" }] : [],
  };
  try {
    if (preview) {
      const mail = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(message);
      const outbox = resolve(process.env.ROOM_DESIGN_DATA_DIR || process.env.DATA_DIR || "data", "storage", "order-preview");
      await mkdir(outbox, { recursive: true, mode: 0o700 });
      await writeFile(resolve(outbox, randomUUID() + ".eml"), mail.message, { mode: 0o600 });
    } else {
      await nodemailer.createTransport({ url: smtpUrl, requireTLS: true, connectionTimeout: 8000, socketTimeout: 12000 }).sendMail(message);
    }
    return Response.json({ ok: true, preview });
  } catch {
    return Response.json({ error: "Не удалось отправить заявку. Проверьте данные и попробуйте ещё раз." }, { status: 502 });
  }
}
