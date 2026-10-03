import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeProposalImage } from "../lib/proposal-pdf-image.ts";
import { proposalImageFormat } from "../lib/proposal-image.ts";

const rgba = { create: { width: 4, height: 3, channels: 4, background: { r: 120, g: 80, b: 40, alpha: 1 } } };
const asDataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

test("PDF image normalization accepts JPEG and PNG by byte signature", async () => {
  const jpeg = await sharp(rgba).jpeg().toBuffer();
  const png = await sharp(rgba).png().toBuffer();
  assert.equal((await normalizeProposalImage(asDataUrl("image/png", jpeg), "visualization")).format, "jpeg");
  assert.equal((await normalizeProposalImage(asDataUrl("image/jpeg", png), "visualization")).format, "png");
});

test("PDF image normalization converts WebP visualization and reference uploads to PNG", async () => {
  const webp = await sharp(rgba).webp().toBuffer();
  const visualization = await normalizeProposalImage(asDataUrl("image/webp", webp), "visualization");
  const reference = await normalizeProposalImage(asDataUrl("image/webp", webp), "reference");
  assert.equal(visualization.detectedFormat, "webp");
  assert.equal(visualization.normalized, true);
  assert.equal(proposalImageFormat(visualization.bytes), "png");
  assert.equal(reference.format, "png");
});

test("extensionless catalog URLs and misleading Content-Type use actual bytes", async () => {
  const png = await sharp(rgba).png().toBuffer();
  const fakeFetch = async () => new Response(png, { headers: { "Content-Type": "image/jpeg" } });
  const image = await normalizeProposalImage("https://catalog.example/product/NRM00116", "catalog", fakeFetch);
  assert.equal(image.format, "png");
  assert.equal(image.normalized, false);
});
