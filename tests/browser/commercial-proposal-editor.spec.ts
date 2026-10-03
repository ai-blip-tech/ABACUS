import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const selectedImage = `data:image/png;base64,${(await sharp({ create: { width: 2, height: 2, channels: 4, background: "#8f1024" } }).png().toBuffer()).toString("base64")}`;

test("commercial proposal editor supports catalog and reference products before PDF", async ({ page }) => {
  const saves: unknown[] = [];
  const pdfPayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/projects/project-preview-12345", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    project: { name: "Гостиная Preview" },
    state: { generatedImage: image, proposalVisualization: selectedImage, proposalShowPrices: true, planItems: [
      { id: "catalog-sofa-a", kind: "sofa", name: "Диван", width: 2200, depth: 900, referenceImage: image, referenceProductId: "sofa-1" },
      { id: "reference-chair-a", kind: "chair", name: "Кресло", width: 2200, depth: 950, referenceHeightMm: 900, referenceImage: image, referenceName: "Диван Миллер с реклайнером" },
    ] },
  }) }));
  await page.route("**/api/catalog?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [{ id: "sofa-1", name: "NORR Sofa", image, images: [image], price: 100000, widthMm: 2200, depthMm: 900, heightMm: 760 }] }) }));
  await page.route("**/api/projects/project-preview-12345/proposal", async (route) => { saves.push(route.request().postDataJSON()); await route.fulfill({ contentType: "application/json", body: "{\"ok\":true}" }); });
  await page.route("**/api/proposal", async (route) => { pdfPayloads.push(route.request().postDataJSON() as Record<string, unknown>); await route.fulfill({ contentType: "application/pdf", body: Buffer.alloc(1600) }); });

  await page.goto("/proposal/project-preview-12345");
  await expect(page.locator(".proposal-cover-page")).toContainText("");
  await expect(page.locator(".proposal-cover-page")).not.toContainText("ROOM DESIGN");
  await expect(page.locator(".proposal-cover-page")).not.toContainText("Гостиная Preview");
  await expect(page.locator(".proposal-visual-page img")).toHaveAttribute("src", selectedImage);
  await expect(page.getByLabel("Наименование")).toHaveCount(2);
  await expect(page.getByLabel("Наименование").nth(0)).toHaveValue("NORR Sofa");
  await expect(page.getByLabel("Наименование").nth(1)).toHaveValue("Диван Миллер с реклайнером");
  await page.getByLabel("Цена: NORR Sofa").fill("90000");
  await page.getByLabel("Цена: Диван Миллер с реклайнером").fill("250000");
  await page.locator(".proposal-product-page").nth(1).getByLabel("Дополнительные параметры").fill("Ткань букле, электрический реклайнер");
  await page.getByText("Показывать цены").click();
  await expect(page.locator(".proposal-price")).toHaveCount(0);
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  await expect.poll(() => pdfPayloads.length).toBe(1);
  expect(pdfPayloads[0].withPrices).toBe(false);
  await page.getByText("Показывать цены").click();
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  await expect.poll(() => pdfPayloads.length).toBe(2);
  expect(pdfPayloads[1].withPrices).toBe(true);
  expect((pdfPayloads[1].products as unknown[]).length).toBe(2);
  expect(saves.some((entry) => JSON.stringify(entry).includes("250000"))).toBe(true);
  expect(saves.some((entry) => JSON.stringify(entry).includes("Ткань букле, электрический реклайнер"))).toBe(true);
});

test("commercial proposal saves a newly created project before opening the editor", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const email = `proposal-unsaved-${Date.now()}@example.com`;

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Proposal save");
  await page.getByLabel("Email логин").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("ProposalSave123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.getByRole("button", { name: "Создать проект" }).first().click();
  await page.getByLabel("НАЗВАНИЕ ПРОЕКТА").fill("Новое коммерческое предложение");
  await page.getByRole("button", { name: "Создать проект" }).click();
  await expect(page.locator("main.studio-shell")).toBeVisible();
  await page.locator(".furniture-choice .upload-zone input[type=file]").setInputFiles({
    name: "interior.png",
    mimeType: "image/png",
    buffer: Buffer.from(image.split(",")[1], "base64"),
  });

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Создать коммерческое предложение" }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/\/proposal\//);
  await expect(popup.locator(".proposal-editor-shell")).toBeVisible();
});

test("commercial proposal snapshots the history version selected in Studio", async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const email = `proposal-selected-${Date.now()}@example.com`;
  const register = await context.request.post("/api/auth/register", { data: { email, password: "ProposalSelected123!", firstName: "Selected" } });
  expect(register.ok()).toBe(true);
  const create = await context.request.post("/api/projects", { data: { name: "Selected render", projectType: "Квартира" } });
  const created = await create.json() as { project: { id: string } };
  const save = await context.request.put(`/api/projects/${created.project.id}`, { data: {
    name: "Selected render", projectType: "Квартира", state: {
      interiorImage: image, generatedImage: selectedImage, generated: true, activeHistoryId: "render-b",
      historyVersions: [
        { id: "render-a", name: "Render A", image, generated: true },
        { id: "render-b", name: "Render B", image: selectedImage, generated: true },
      ],
      planItems: [{ id: "reference-chair", kind: "chair", name: "Кресло", x: 30, y: 40, width: 800, depth: 800, rotation: 0, referenceImage: image, referenceName: "Кресло" }],
    },
  } });
  expect(save.ok()).toBe(true);
  const snapshots: string[] = [];
  await page.route(`**/api/projects/${created.project.id}/proposal`, async (route) => {
    const body = route.request().postDataJSON() as { visualization?: string };
    if (body.visualization) snapshots.push(body.visualization);
    await route.continue();
  });

  await page.goto("/#кабинет");
  await page.locator(".projects-dashboard-project").filter({ hasText: "Selected render" }).click();
  await page.getByRole("button", { name: "Render A", exact: true }).click();
  let popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Создать коммерческое предложение" }).click();
  let popup = await popupPromise;
  await popup.waitForURL(/\/proposal\//);
  await expect(popup.locator(".proposal-visual-page img")).toBeVisible();
  await popup.close();

  await page.getByRole("button", { name: "Render B", exact: true }).click();
  popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Создать коммерческое предложение" }).click();
  popup = await popupPromise;
  await popup.waitForURL(/\/proposal\//);
  await expect.poll(() => snapshots.length).toBe(2);
  expect(snapshots[0]).not.toBe(snapshots[1]);
  await popup.close();
});

test("commercial proposal creates a real PDF from a saved reference product", async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const representativeImage = `data:image/png;base64,${(await readFile("public/generated-bleed-runner.png")).toString("base64")}`;
  const webpImage = `data:image/webp;base64,${(await sharp(await readFile("public/generated-bleed-runner.png")).resize(640, 400).webp({ quality: 82 }).toBuffer()).toString("base64")}`;
  const email = `proposal-pdf-${Date.now()}@example.com`;
  const register = await context.request.post("/api/auth/register", { data: { email, password: "ProposalPreview123!", firstName: "Proposal" } });
  expect(register.ok()).toBe(true);
  const create = await context.request.post("/api/projects", { data: { name: "PDF Preview", projectType: "Квартира" } });
  const created = await create.json() as { project: { id: string } };
  const save = await context.request.put(`/api/projects/${created.project.id}`, { data: {
    name: "PDF Preview", projectType: "Квартира", state: {
      interiorImage: representativeImage, generatedImage: webpImage, generated: true,
      planItems: [
        { id: "reference-chair", kind: "chair", name: "Кресло", x: 30, y: 40, width: 2200, depth: 950, rotation: 0, referenceImage: webpImage, referenceName: "Диван Миллер с реклайнером", referenceHeightMm: 900 },
        { id: "catalog-table", kind: "table", name: "Стол", x: 55, y: 55, width: 900, depth: 600, rotation: 0, referenceImage: webpImage, referenceProductId: "NRM00116" },
      ],
    },
  } });
  expect(save.ok()).toBe(true);
  await page.route("**/api/catalog?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [{ id: "NRM00116", name: "BOX COFFEE TABLE", image: webpImage, images: [webpImage], price: 89000, widthMm: 900, depthMm: 600, heightMm: 380 }] }) }));
  await page.goto(`/proposal/${created.project.id}`);
  await page.getByLabel("Цена: Диван Миллер с реклайнером").fill("250000");
  await page.locator(".proposal-product-page").nth(0).getByLabel("Дополнительные параметры").fill("Ткань букле, электрический реклайнер");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const download = await downloadPromise;
  if (process.env.PROPOSAL_PDF_OUTPUT) await download.saveAs(process.env.PROPOSAL_PDF_OUTPUT);
  const path = await download.path();
  expect(path).toBeTruthy();
  const pdf = await PDFDocument.load(await readFile(path!));
  expect(pdf.getPageCount()).toBe(5);
});
