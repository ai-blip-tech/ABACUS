import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import sharp from "sharp";
import { approvedProposalFixture } from "../fixtures/commercial-proposal-approved";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const selectedImage = `data:image/png;base64,${(await sharp({ create: { width: 2, height: 3, channels: 4, background: "#8f1024" } }).png().toBuffer()).toString("base64")}`;

test("approved proposal visual fixture keeps the exact reference content", async () => {
  expect(approvedProposalFixture.document.offerNumber).toBe("№ 112");
  expect(approvedProposalFixture.prices.total).toBe(302_715);
  expect(approvedProposalFixture.brands).toEqual({
    sofa: "NORR MÖBLER SELECTION", lamp: "SEYVAA PARIS", rug: "NORR CARPETS",
  });
});

test("commercial proposal editor supports catalog and reference products before PDF", async ({ page }) => {
  const saves: unknown[] = [];
  const pdfPayloads: Array<Record<string, unknown>> = [];
  const pptxPayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/projects/project-preview-12345", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    project: { name: "Гостиная Preview" },
    state: { generatedImage: image, proposalVisualization: selectedImage, proposalShowPrices: true, planItems: [
      { id: "catalog-sofa-a", kind: "sofa", name: "Диван", width: 2200, depth: 900, referenceImage: image, referenceProductId: "sofa-1" },
      { id: "reference-chair-a", kind: "chair", name: "Кресло", width: 2200, depth: 950, referenceHeightMm: 900, referenceImage: selectedImage, referenceName: "Диван Миллер с реклайнером" },
    ], proposalItems: [
      { id: "editor-table-a", kind: "table", name: "Стол", width: 900, depth: 600, referenceImage: image, referenceProductId: "table-1" },
    ] },
  }) }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: { firstName: "Кирилл", lastName: "Волосников", email: "kirill@example.com" } }) }));
  await page.route("**/api/catalog?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [
    { id: "sofa-1", name: "NORR Sofa", image, images: [image], price: 100000, widthMm: 2200, depthMm: 900, heightMm: 760 },
    { id: "table-1", name: "NORR Table", image, images: [image], price: 70000, widthMm: 900, depthMm: 600, heightMm: 400 },
  ] }) }));
  await page.route("**/api/projects/project-preview-12345/proposal", async (route) => { saves.push(route.request().postDataJSON()); await route.fulfill({ contentType: "application/json", body: "{\"ok\":true}" }); });
  await page.route("**/api/proposal", async (route) => { pdfPayloads.push(route.request().postDataJSON() as Record<string, unknown>); await route.fulfill({ contentType: "application/pdf", body: Buffer.alloc(1600) }); });
  await page.route("**/api/proposal/pptx", async (route) => { pptxPayloads.push(route.request().postDataJSON() as Record<string, unknown>); await route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body: Buffer.alloc(1600) }); });

  await page.goto("/proposal/project-preview-12345");
  await expect(page.locator(".proposal-cover-page h1")).toContainText("Коммерческое");
  await expect(page.locator(".proposal-cover-page h1")).toContainText("предложение");
  await expect(page.getByLabel("Проект")).toHaveValue("Гостиная Preview");
  await expect(page.locator(".proposal-selection-page img")).toHaveAttribute("src", selectedImage);
  await expect(page.locator(".proposal-about-page img")).toHaveAttribute("src", selectedImage);
  const [selectionTitle, selectionSubtitle, aboutHero, aboutHeading, benefits] = await Promise.all([
    page.locator(".proposal-selection-page h2").boundingBox(),
    page.locator(".proposal-selection-page > p").boundingBox(),
    page.locator(".proposal-about-hero").boundingBox(),
    page.locator(".proposal-about-page h3").boundingBox(),
    page.locator(".proposal-benefits").boundingBox(),
  ]);
  expect(selectionTitle && selectionSubtitle && selectionTitle.y + selectionTitle.height <= selectionSubtitle.y).toBe(true);
  expect(aboutHero && aboutHeading && aboutHero.y + aboutHero.height <= aboutHeading.y).toBe(true);
  expect(aboutHeading && benefits && aboutHeading.y + aboutHeading.height <= benefits.y).toBe(true);
  const aboutPage = await page.locator(".proposal-about-page").boundingBox();
  expect(aboutHero && aboutPage && aboutHero.height < aboutPage.height * .4).toBe(true);
  await expect(page.locator(".proposal-product-page").nth(0).locator("img")).toHaveAttribute("src", image);
  await expect(page.locator(".proposal-product-page").nth(1).locator("img")).toHaveAttribute("src", selectedImage);
  await expect(page.getByLabel("Наименование")).toHaveCount(3);
  await expect(page.getByLabel("Наименование").nth(0)).toHaveValue("NORR Sofa");
  await expect(page.getByLabel("Наименование").nth(1)).toHaveValue("Диван Миллер с реклайнером");
  await expect(page.getByLabel("Наименование").nth(2)).toHaveValue("NORR Table");
  await expect(page.locator(".proposal-manager-page")).toContainText("Кирилл Волосников");
  await expect(page.locator(".proposal-manager-person")).not.toContainText("ВАШ ЧЕЛОВЕК В NORR");
  await expect(page.getByLabel("Должность")).toHaveValue("Персональный менеджер");
  await page.getByLabel("Клиент").fill("Анна Петрова");
  await page.getByLabel("Цена: NORR Sofa").fill("90000");
  await page.getByLabel("Цена: Диван Миллер с реклайнером").fill("250000");
  await page.locator(".proposal-product-page").nth(1).getByLabel("Примечание").fill("Ткань букле, электрический реклайнер");
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
  expect(pdfPayloads[1].coverImage).toBe(selectedImage);
  expect((pdfPayloads[1].products as unknown[]).length).toBe(3);
  expect((pdfPayloads[1].products as Array<{ referenceImage: string }>).map((product) => product.referenceImage)).toEqual([image, selectedImage, image]);
  await page.getByRole("button", { name: "Скачать PPT" }).click();
  await expect.poll(() => pptxPayloads.length).toBe(1);
  expect((pptxPayloads[0].products as unknown[]).length).toBe(3);
  expect(saves.some((entry) => JSON.stringify(entry).includes("250000"))).toBe(true);
  expect(saves.some((entry) => JSON.stringify(entry).includes("Ткань букле, электрический реклайнер"))).toBe(true);
  expect(saves.some((entry) => JSON.stringify(entry).includes("Анна Петрова"))).toBe(true);
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

test("saved Image Editor catalog products survive reload and appear in the proposal", async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const email = `proposal-editor-products-${Date.now()}@example.com`;
  const register = await context.request.post("/api/auth/register", { data: { email, password: "ProposalProducts123!", firstName: "Catalog" } });
  expect(register.ok()).toBe(true);
  const create = await context.request.post("/api/projects", { data: { name: "Товары из редактора", projectType: "Квартира" } });
  const created = await create.json() as { project: { id: string } };
  const save = await context.request.put(`/api/projects/${created.project.id}`, { data: {
    name: "Товары из редактора", projectType: "Квартира", state: {
      interiorImage: image, generatedImage: selectedImage, generated: true, planItems: [],
      proposalItems: [
        { id: "editor-sofa", kind: "sofa", name: "Catalog Sofa", x: 44, y: 52, width: 2200, depth: 900, rotation: 0, referenceImage: image, referenceProductId: "editor-sofa-product" },
        { id: "editor-table", kind: "table", name: "Catalog Table", x: 61, y: 67, width: 900, depth: 600, rotation: 0, referenceImage: image, referenceProductId: "editor-table-product" },
        { id: "editor-lamp", kind: "lamp", name: "Catalog Lamp", x: 74, y: 41, width: 500, depth: 500, rotation: 0, referenceImage: image, referenceProductId: "editor-lamp-product" },
      ],
    },
  } });
  expect(save.ok()).toBe(true);
  const reopened = await context.request.get(`/api/projects/${created.project.id}`);
  expect(reopened.ok()).toBe(true);
  const reopenedPayload = await reopened.json() as { state: { proposalItems?: unknown[] } };
  expect(reopenedPayload.state.proposalItems).toHaveLength(3);

  await page.route("**/api/catalog?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [
    { id: "editor-sofa-product", name: "Catalog Sofa", image, images: [image], price: 180000, widthMm: 2200, depthMm: 900 },
    { id: "editor-table-product", name: "Catalog Table", image, images: [image], price: 80000, widthMm: 900, depthMm: 600 },
    { id: "editor-lamp-product", name: "Catalog Lamp", image, images: [image], price: 42000, widthMm: 500, depthMm: 500 },
  ] }) }));
  await page.goto(`/proposal/${created.project.id}`);
  await expect(page.locator(".proposal-product-page")).toHaveCount(3);
  await expect(page.getByLabel("Количество предметов")).toHaveValue("3 предмета");
  await expect(page.locator(".proposal-summary-table")).toContainText("Catalog Sofa");
  await expect(page.locator(".proposal-summary-table")).toContainText("Catalog Table");
  await expect(page.locator(".proposal-summary-table")).toContainText("Catalog Lamp");
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
        { id: "render-a", name: "Render A", image, generated: true, proposalItems: [{ id: "render-a-sofa", kind: "sofa", name: "Old Sofa", x: 30, y: 40, width: 1900, depth: 900, rotation: 0, referenceImage: image, referenceProductId: "old-sofa" }] },
        { id: "render-b", name: "Render B", image: selectedImage, generated: true, proposalItems: [{ id: "render-b-table", kind: "table", name: "Final Table", x: 60, y: 60, width: 900, depth: 600, rotation: 0, referenceImage: image, referenceProductId: "final-table" }] },
      ],
      planItems: [{ id: "reference-chair", kind: "chair", name: "Кресло", x: 30, y: 40, width: 800, depth: 800, rotation: 0, referenceImage: image, referenceName: "Кресло" }],
    },
  } });
  expect(save.ok()).toBe(true);
  const reopened = await context.request.get(`/api/projects/${created.project.id}`);
  const reopenedPayload = await reopened.json() as { state: { historyVersions: Array<{ proposalItems?: Array<{ id: string }> }> } };
  expect(reopenedPayload.state.historyVersions[0].proposalItems?.map((item) => item.id)).toEqual(["render-a-sofa"]);
  expect(reopenedPayload.state.historyVersions[1].proposalItems?.map((item) => item.id)).toEqual(["render-b-table"]);
  await page.route("**/api/catalog?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [
    { id: "old-sofa", name: "Old Sofa", image, images: [image], price: 100000, widthMm: 1900, depthMm: 900 },
    { id: "final-table", name: "Final Table", image, images: [image], price: 70000, widthMm: 900, depthMm: 600 },
  ] }) }));
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
  await expect(popup.locator(".proposal-selection-page img")).toBeVisible();
  await expect(popup.locator(".proposal-product-page")).toHaveCount(1);
  await expect(popup.locator(".proposal-summary-table")).toContainText("Old Sofa");
  await expect(popup.locator(".proposal-summary-table")).not.toContainText("Final Table");
  await expect(popup.locator(".proposal-summary-table")).not.toContainText("Кресло");
  const firstSnapshot = await (await context.request.get(`/api/projects/${created.project.id}`)).json() as { state: { proposalHistoryId?: string } };
  expect(firstSnapshot.state.proposalHistoryId).toBe("render-a");
  await popup.close();

  await page.getByRole("button", { name: "Render B", exact: true }).click();
  popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Создать коммерческое предложение" }).click();
  popup = await popupPromise;
  await popup.waitForURL(/\/proposal\//);
  await expect(popup.locator(".proposal-product-page")).toHaveCount(1);
  await expect(popup.locator(".proposal-summary-table")).toContainText("Final Table");
  await expect(popup.locator(".proposal-summary-table")).not.toContainText("Old Sofa");
  await expect(popup.locator(".proposal-summary-table")).not.toContainText("Кресло");
  const secondSnapshot = await (await context.request.get(`/api/projects/${created.project.id}`)).json() as { state: { proposalHistoryId?: string } };
  expect(secondSnapshot.state.proposalHistoryId).toBe("render-b");
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
        { id: "reference-rug", kind: "rug", name: "Ковёр", x: 45, y: 64, width: 2300, depth: 2000, rotation: 0, referenceImage: webpImage, referenceName: "Ковёр COLUMBIA" },
      ],
      proposalItems: [
        { id: "catalog-table", kind: "table", name: "Стол", x: 55, y: 55, width: 900, depth: 600, rotation: 0, referenceImage: webpImage, referenceProductId: "NRM00116" },
        ...Array.from({ length: 11 }, (_, index) => ({ id: `extra-reference-${index + 1}`, kind: "chair", name: `Дополнительный предмет ${index + 1}`, x: 10 + index, y: 20 + index, width: 700, depth: 700, rotation: 0, referenceImage: webpImage, referenceName: `Дополнительный предмет ${index + 1}` })),
      ],
    },
  } });
  expect(save.ok()).toBe(true);
  await page.route("**/api/catalog?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [{ id: "NRM00116", name: "BOX COFFEE TABLE", image: webpImage, images: [webpImage], price: 89000, widthMm: 900, depthMm: 600, heightMm: 380 }] }) }));
  await page.goto(`/proposal/${created.project.id}`);
  await page.getByLabel("Цена: Диван Миллер с реклайнером").fill("250000");
  await page.locator(".proposal-product-page").nth(0).getByLabel("Примечание").fill("Ткань букле, электрический реклайнер");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const download = await downloadPromise;
  if (process.env.PROPOSAL_PDF_OUTPUT) await download.saveAs(process.env.PROPOSAL_PDF_OUTPUT);
  const path = await download.path();
  expect(path).toBeTruthy();
  const pdf = await PDFDocument.load(await readFile(path!));
  expect(pdf.getPageCount()).toBe(20);

  const pptxDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PPT" }).click();
  const pptxDownload = await pptxDownloadPromise;
  if (process.env.PROPOSAL_PPTX_OUTPUT) await pptxDownload.saveAs(process.env.PROPOSAL_PPTX_OUTPUT);
  const pptxPath = await pptxDownload.path();
  expect(pptxPath).toBeTruthy();
  const archive = await JSZip.loadAsync(await readFile(pptxPath!));
  expect(archive.file("ppt/presentation.xml")).toBeTruthy();
  expect(Object.keys(archive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(20);
});

test("long specification is split before totals and conditions", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const products = Array.from({ length: 14 }, (_, index) => ({
    id: `item-${index + 1}`, kind: "chair", name: `Предмет ${index + 1}`, width: 800, depth: 800,
    referenceImage: image, referenceName: `Предмет ${index + 1}`,
  }));
  await page.route("**/api/projects/project-many-items", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    project: { name: "Большая спецификация" }, state: { generatedImage: image, proposalItems: products },
  }) }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: "{\"user\":{}}" }));
  await page.goto("/proposal/project-many-items");
  await expect(page.locator(".proposal-summary-page")).toHaveCount(2);
  await expect(page.locator(".proposal-summary-page.is-continuation .proposal-summary-table > div")).toHaveCount(10);
  await expect(page.locator(".proposal-summary-page.has-final-summary .proposal-summary-table > div")).toHaveCount(6);
  const finalTable = await page.locator(".proposal-summary-page.has-final-summary .proposal-summary-table").boundingBox();
  const finalTotal = await page.locator(".proposal-summary-page.has-final-summary .proposal-summary-total").boundingBox();
  expect(finalTable && finalTotal && finalTable.y + finalTable.height <= finalTotal.y).toBe(true);
});
