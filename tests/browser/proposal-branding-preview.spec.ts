import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";

test("proposal branding preview exports six clean pages to PDF and PPT", async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const outputRoot = resolve(process.env.PROPOSAL_BRAND_OUTPUT || "tmp/proposal-brand-audit/generated");
  await mkdir(outputRoot, { recursive: true });
  const image = `data:image/png;base64,${(await readFile("public/generated-bleed-runner.png")).toString("base64")}`;
  const email = `proposal-brand-${Date.now()}@example.com`;
  const register = await context.request.post("/api/auth/register", { data: { email, password: "ProposalBrand123!", firstName: "Кирилл", lastName: "Волосников", companyRole: "ROOMDESIGN" } });
  expect(register.ok()).toBe(true);
  const create = await context.request.post("/api/projects", { data: { name: "NORR Preview", projectType: "Квартира" } });
  const created = await create.json() as { project: { id: string } };
  const save = await context.request.put(`/api/projects/${created.project.id}`, { data: {
    name: "NORR Preview", projectType: "Квартира", state: {
      interiorImage: image, generatedImage: image, generated: true,
      proposalItems: [{ id: "preview-chair", kind: "chair", name: "Кресло BERNINA", x: 30, y: 40, width: 800, depth: 800, height: 760, referenceImage: image, referenceName: "Кресло BERNINA", proposalOverride: { article: "BERNINA-01", price: 126000, brand: "NORR MÖBLER SELECTION" } }],
    },
  } });
  expect(save.ok()).toBe(true);
  await page.goto(`/proposal/${created.project.id}`);
  await expect(page.locator(".proposal-page")).toHaveCount(6);
  await expect(page.locator(".proposal-running-head")).toHaveCount(0);
  await expect(page.locator(".proposal-page-footer")).toHaveCount(4);
  await expect(page.locator(".proposal-page-footer")).toHaveText(Array(4).fill("NORRMOBLER.RU"));
  const extractedPreviewText = await page.locator(".proposal-document").innerText();
  expect(extractedPreviewText.match(/NORRMOBLER\.RU/g)).toHaveLength(5);
  expect(extractedPreviewText.match(/norrmobler\.ru/g)).toHaveLength(1);
  await page.screenshot({ path: resolve(outputRoot, "editor-preview.png"), fullPage: true });

  const pdfEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const pdfDownload = await pdfEvent;
  const pdfPath = resolve(outputRoot, "NORR_Commercial_Proposal_Preview.pdf");
  await mkdir(dirname(pdfPath), { recursive: true });
  await pdfDownload.saveAs(pdfPath);
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  expect(pdf.getPageCount()).toBe(6);
  expect(pdf.getAuthor()).toBe("norrmobler.ru");

  const pptEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PPT" }).click();
  const pptDownload = await pptEvent;
  await pptDownload.saveAs(resolve(outputRoot, "NORR_Commercial_Proposal_Preview.pptx"));
});
