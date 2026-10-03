import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("commercial proposal editor supports catalog and reference products before PDF", async ({ page }) => {
  const saves: unknown[] = [];
  const pdfPayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/projects/project-preview-12345", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    project: { name: "Гостиная Preview" },
    state: { generatedImage: image, proposalShowPrices: true, planItems: [
      { id: "catalog-sofa-a", kind: "sofa", name: "Диван", width: 2200, depth: 900, referenceImage: image, referenceProductId: "sofa-1" },
      { id: "reference-chair-a", kind: "chair", name: "Кресло", width: 800, depth: 800, referenceImage: image, referenceName: "Reference chair" },
    ] },
  }) }));
  await page.route("**/api/catalog?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [{ id: "sofa-1", name: "NORR Sofa", image, images: [image], price: 100000, widthMm: 2200, depthMm: 900, heightMm: 760 }] }) }));
  await page.route("**/api/projects/project-preview-12345/proposal", async (route) => { saves.push(route.request().postDataJSON()); await route.fulfill({ contentType: "application/json", body: "{\"ok\":true}" }); });
  await page.route("**/api/proposal", async (route) => { pdfPayloads.push(route.request().postDataJSON() as Record<string, unknown>); await route.fulfill({ contentType: "application/pdf", body: Buffer.alloc(1600) }); });

  await page.goto("/proposal/project-preview-12345");
  await expect(page.getByLabel("Наименование")).toHaveCount(2);
  await expect(page.locator('input[value="NORR Sofa"]')).toBeVisible();
  await expect(page.locator('input[value="Reference chair"]')).toBeVisible();
  await page.getByLabel("Цена: NORR Sofa").fill("90000");
  await page.getByLabel("Цена: Reference chair").fill("75000");
  await page.getByText("Показывать цены").click();
  await expect(page.locator(".proposal-price")).toHaveCount(0);
  await page.getByText("Показывать цены").click();
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  await expect.poll(() => pdfPayloads.length).toBe(1);
  expect(pdfPayloads[0].withPrices).toBe(true);
  expect((pdfPayloads[0].products as unknown[]).length).toBe(2);
});

test("commercial proposal creates a real PDF from a saved reference product", async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const representativeImage = `data:image/png;base64,${(await readFile("public/generated-bleed-runner.png")).toString("base64")}`;
  const email = `proposal-pdf-${Date.now()}@example.com`;
  const register = await context.request.post("/api/auth/register", { data: { email, password: "ProposalPreview123!", firstName: "Proposal" } });
  expect(register.ok()).toBe(true);
  const create = await context.request.post("/api/projects", { data: { name: "PDF Preview", projectType: "Квартира" } });
  const created = await create.json() as { project: { id: string } };
  const save = await context.request.put(`/api/projects/${created.project.id}`, { data: {
    name: "PDF Preview", projectType: "Квартира", state: {
      interiorImage: representativeImage, generatedImage: representativeImage, generated: true,
      planItems: [{ id: "reference-chair", kind: "chair", name: "Кресло", x: 30, y: 40, width: 800, depth: 800, rotation: 0, referenceImage: representativeImage, referenceName: "Кресло по референсу" }],
    },
  } });
  expect(save.ok()).toBe(true);
  await page.goto(`/proposal/${created.project.id}`);
  await page.getByLabel("Цена: Кресло по референсу").fill("75000");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const download = await downloadPromise;
  if (process.env.PROPOSAL_PDF_OUTPUT) await download.saveAs(process.env.PROPOSAL_PDF_OUTPUT);
  const path = await download.path();
  expect(path).toBeTruthy();
  const pdf = await PDFDocument.load(await readFile(path!));
  expect(pdf.getPageCount()).toBe(4);
});
