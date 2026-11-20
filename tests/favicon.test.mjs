import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const root = process.cwd();
const publicDir = path.join(root, "public");

test("approved RD favicon is a self-contained vector in both themes", async () => {
  for (const filename of ["favicon.svg", "favicon-dark.svg"]) {
    const source = await fs.readFile(path.join(publicDir, filename), "utf8");
    assert.match(source, /viewBox="0 0 512 512"/);
    assert.match(source, /<circle\b/);
    assert.match(source, /#2A1710/i);
    assert.doesNotMatch(source, /<script\b|<foreignObject\b|(?:href|src)=["']https?:/i);
  }
  assert.equal(await fs.readFile(path.join(publicDir,"favicon.svg"),"utf8"),await fs.readFile(path.join(publicDir,"favicon-dark.svg"),"utf8"));
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
  assert.ok(ico.readUInt16LE(4) >= 3, "ICO image count");
  const sizes=Array.from({length:ico.readUInt16LE(4)},(_,index)=>ico.readUInt8(6+index*16)||256);
  for(const size of [16,32,48]) assert.ok(sizes.includes(size));
});

test("metadata connects theme icons, Apple icon and manifest", async () => {
  const layout = await fs.readFile(path.join(root, "app/layout.tsx"), "utf8");
  for (const required of [
    "/favicon.svg?v=rd-final-20261120",
    "/favicon-dark.svg?v=rd-final-20261120",
    "/favicon.ico?v=rd-final-20261120",
    "/apple-touch-icon.png?v=rd-final-20261120",
    "/site.webmanifest?v=rd-final-20261120",
  ]) {
    assert.ok(layout.includes(required), `metadata must include ${required}`);
  }
  assert.ok(layout.includes("prefers-color-scheme: light"));
  assert.ok(layout.includes("prefers-color-scheme: dark"));
});
