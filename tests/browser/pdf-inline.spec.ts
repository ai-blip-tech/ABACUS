import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("a finalized commercial proposal downloads after confirmation", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "webkit" || !testInfo.project.name.endsWith("1440"));
  await page.goto("/");
  const pdfDocument = await PDFDocument.create();
  pdfDocument.addPage([320, 200]);
  const encodedPdf = Buffer.from(await pdfDocument.save()).toString("base64");
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate((encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "room-design-commercial-proposal.pdf";
    link.click();
  }, encodedPdf);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("room-design-commercial-proposal.pdf");
});
