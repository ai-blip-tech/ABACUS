import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { jpegDownloadName } from "../lib/client-image-download.ts";

const [downloadSource, pageSource] = await Promise.all([
  readFile(new URL("../lib/client-image-download.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("generation downloads use safe JPEG filenames", () => {
  assert.equal(jpegDownloadName("Новая визуализация"), "Новая-визуализация.jpg");
  assert.equal(jpegDownloadName("  Project / version #2  "), "Project-version-2.jpg");
  assert.equal(jpegDownloadName("***"), "room-design-визуализация.jpg");
});

test("current and history images are genuinely converted to JPEG before download", () => {
  assert.match(downloadSource, /canvas\.toBlob\([\s\S]*"image\/jpeg", 0\.95/);
  assert.match(downloadSource, /context\.fillRect\(0, 0, canvas\.width, canvas\.height\)/);
  assert.match(pageSource, /downloadImageAsJpeg\(source, projectName \|\| "norr-визуализация"\)/);
  assert.match(pageSource, /downloadImageAsJpeg\(version\.image, version\.name\)/);
  assert.doesNotMatch(pageSource, /link\.download[^;]*\.webp/);
});
