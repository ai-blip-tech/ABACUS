import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("an asynchronously prepared PDF stays in a pre-opened browser tab", async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== "webkit" || !testInfo.project.name.endsWith("1440"), "Headless Chromium downloads PDFs regardless of inline disposition; verify its headed viewer manually.");
  await page.goto("/");
  const document = await PDFDocument.create();
  document.addPage([320, 200]);
  const encodedPdf = Buffer.from(await document.save()).toString("base64");
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  context.on("page", (openedPage) => openedPage.on("download", () => { downloads += 1; }));
  const popupPromise = context.waitForEvent("page");
  await page.evaluate((encoded) => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) throw new Error("Popup was blocked");
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    window.setTimeout(() => popup.location.replace(url), 0);
  }, encodedPdf);
  const popup = await popupPromise;
  await page.waitForTimeout(750);
  expect(downloads).toBe(0);
  expect(await popup.evaluate(() => window.closed)).toBe(false);
  await expect.poll(() => popup.url()).toMatch(/^blob:/);
});
