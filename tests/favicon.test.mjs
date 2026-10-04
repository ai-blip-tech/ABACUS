import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const root = process.cwd();
const publicDir = path.join(root, "public");

test("Editorial R Cut SVGs are path-based and use only approved colors", async () => {
  const approved = new Set(["#1A1917", "#6E242A", "#F7F5F1", "#FFFFFF", "#000000"]);

  for (const filename of ["favicon.svg", "favicon-dark.svg", "safari-pinned-tab.svg"]) {
    const source = await fs.readFile(path.join(publicDir, filename), "utf8");
    assert.doesNotMatch(source, /<text\b/i, `${filename} must not contain text glyphs`);
    assert.match(source, /<path\b/i, `${filename} must contain vector paths`);
    assert.match(source, /viewBox="0 0 256 256"/);
    for (const color of source.match(/#[0-9A-Fa-f]{6}/g) ?? []) {
      assert.ok(approved.has(color.toUpperCase()), `${filename} contains unapproved color ${color}`);
    }
  }
});

test("favicon rasters have the required dimensions", async () => {
  const expected = new Map([
    ["favicon-16x16.png", 16],
    ["favicon-32x32.png", 32],
    ["favicon-48x48.png", 48],
    ["apple-touch-icon.png", 180],
    ["android-chrome-192x192.png", 192],
    ["android-chrome-512x512.png", 512],
  ]);

  for (const [filename, size] of expected) {
    const metadata = await sharp(path.join(publicDir, filename)).metadata();
    assert.equal(metadata.width, size, `${filename} width`);
    assert.equal(metadata.height, size, `${filename} height`);
  }
});

test("favicon.ico embeds 16, 32 and 48 px images", async () => {
  const ico = await fs.readFile(path.join(publicDir, "favicon.ico"));
  assert.equal(ico.readUInt16LE(2), 1, "ICO image type");
  assert.equal(ico.readUInt16LE(4), 3, "ICO image count");
  assert.deepEqual(
    [0, 1, 2].map((index) => ico.readUInt8(6 + index * 16)),
    [16, 32, 48],
  );
});

test("metadata connects theme icons, Apple icon, manifest and Safari mask", async () => {
  const layout = await fs.readFile(path.join(root, "app/layout.tsx"), "utf8");
  for (const required of [
    "/favicon.svg?v=editorial-r-1",
    "/favicon-dark.svg?v=editorial-r-1",
    "/favicon.ico?v=editorial-r-1",
    "/apple-touch-icon.png?v=editorial-r-1",
    "/safari-pinned-tab.svg?v=editorial-r-1",
    "/site.webmanifest?v=editorial-r-1",
  ]) {
    assert.ok(layout.includes(required), `metadata must include ${required}`);
  }
  assert.ok(layout.includes("prefers-color-scheme: light"));
  assert.ok(layout.includes("prefers-color-scheme: dark"));
});
