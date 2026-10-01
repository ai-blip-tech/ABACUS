import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compositeMaskedPixels } from "../lib/masked-composite.ts";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

const scenes = [
  { name: "simple object", width: 16, height: 12, box: [4, 3, 9, 8] },
  { name: "complex scene", width: 24, height: 18, box: [11, 4, 17, 13] },
  { name: "overlapping objects", width: 18, height: 16, box: [6, 7, 12, 12] },
  { name: "large object", width: 20, height: 18, box: [2, 2, 17, 14] },
  { name: "small object", width: 20, height: 18, box: [13, 9, 15, 11] },
];

for (const scene of scenes) {
  for (const operation of ["Remove", "Replace", "Material", "Add"]) {
    test(`${operation} preserves every pixel outside the mask: ${scene.name}`, () => {
      const { width, height, box } = scene;
      const source = new Uint8ClampedArray(width * height * 4);
      const provider = new Uint8ClampedArray(source.length);
      const mask = new Uint8ClampedArray(source.length);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        source.set([x * 7, y * 11, (x + y) * 5, 255], index);
        provider.set([255, 0, 100, 255], index);
        mask.set([0, 0, 0, x >= box[0] && x < box[2] && y >= box[1] && y < box[3] ? 0 : 255], index);
      }
      const result = compositeMaskedPixels(source, provider, mask);
      for (let index = 0; index < source.length; index += 4) {
        const inside = mask[index + 3] === 0;
        assert.deepEqual([...result.slice(index, index + 4)], [...(inside ? provider : source).slice(index, index + 4)]);
      }
    });
  }
}

test("partially transparent mask blends only the boundary", () => {
  const result = compositeMaskedPixels(Uint8ClampedArray.from([10, 20, 30, 255]), Uint8ClampedArray.from([210, 220, 230, 255]), Uint8ClampedArray.from([0, 0, 0, 128]));
  assert.deepEqual([...result], [110, 120, 130, 255]);
});

test("invalid mask dimensions fail instead of producing a broad edit", () => {
  assert.throws(() => compositeMaskedPixels(new Uint8ClampedArray(8), new Uint8ClampedArray(8), new Uint8ClampedArray(4)));
});

test("Add, Replace and queued edits composite provider output into the source", () => {
  assert.match(page, /const imageUrl = local \? await local\.compose\(await blobToDataUrl\(imageBlob\)\)/);
  assert.match(page, /roomImage=await local\.compose\(await blobToDataUrl\(blob\)\)/);
  assert.match(page, /const removeAtPlacement[\s\S]*?getPointObjectMask\(roomImage,point\)/);
  assert.match(page, /const removeSelectedObject[\s\S]*?getExactMask\(roomImage,item\)/);
  assert.doesNotMatch(page, /catch \{ mask=await createRemovalMask/);
  assert.doesNotMatch(page, /createSurfaceFallbackMask/);
});
