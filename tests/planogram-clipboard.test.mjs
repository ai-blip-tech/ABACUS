import assert from "node:assert/strict";
import test from "node:test";
import { clonePlanogramItem } from "../lib/planogram-clipboard.ts";

test("planogram paste creates an independent offset clone with a new id", () => {
  const source = {
    id: "source",
    kind: "sofa",
    name: "Диван",
    x: 20,
    y: 30,
    width: 2200,
    depth: 950,
    rotation: 45,
    referenceImages: ["first", "second"],
    referenceParameters: [{ name: "Материал", value: "Букле" }],
  };
  const clone = clonePlanogramItem(source, "clone", 1);

  assert.equal(clone.id, "clone");
  assert.equal(clone.x, 22.5);
  assert.equal(clone.y, 32.5);
  assert.equal(clone.width, source.width);
  assert.equal(clone.depth, source.depth);
  assert.equal(clone.rotation, source.rotation);
  assert.deepEqual(clone.referenceImages, source.referenceImages);
  assert.notEqual(clone.referenceImages, source.referenceImages);
  assert.notEqual(clone.referenceParameters, source.referenceParameters);

  clone.referenceImages.push("third");
  assert.deepEqual(source.referenceImages, ["first", "second"]);
});

test("successive planogram pastes remain visible near board boundaries", () => {
  const source = { id: "source", x: 93, y: 92 };
  const first = clonePlanogramItem(source, "first", 1);
  const fifth = clonePlanogramItem(source, "fifth", 5);
  assert.deepEqual({ x: first.x, y: first.y }, { x: 94, y: 94 });
  assert.deepEqual({ x: fifth.x, y: fifth.y }, { x: 94, y: 94 });
});
