import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizePlanReferenceImages } from "../lib/plan-render.ts";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const projectRouteSource = await readFile(new URL("../app/api/projects/[id]/route.ts", import.meta.url), "utf8");

test("saved project reference assets are converted before a planogram render", async () => {
  const inlineImage = "data:image/png;base64,aW5saW5l";
  const savedFurniture = "/api/projects/project-123456/assets/plan-item-0";
  const savedFloor = "/api/projects/project-123456/assets/plan-floor";
  const catalogImage = "https://norrmobler.ru/images/chair.webp";
  const loaded = [];

  const normalized = await normalizePlanReferenceImages(
    [inlineImage, savedFurniture, savedFloor, catalogImage],
    async (source) => {
      loaded.push(source);
      return `data:image/webp;base64,${Buffer.from(source).toString("base64")}`;
    },
  );

  assert.equal(normalized[0], inlineImage);
  assert.match(normalized[1], /^data:image\/webp;base64,/);
  assert.match(normalized[2], /^data:image\/webp;base64,/);
  assert.equal(normalized[3], catalogImage);
  assert.deepEqual(loaded, [savedFurniture, savedFloor]);
  assert.match(projectRouteSource, /referenceImage: referenceAsset \? assetUrl\(projectId, referenceAsset\)/);
  assert.match(pageSource, /normalizePlanReferenceImages\(referenceSources, blobAsDataUrl\)/);
});

test("planogram errors are rendered inside the creation panel", () => {
  assert.match(pageSource, /activeTool === "Планограмма" \? <>\{generationError&&<p className="panel-error" role="alert">/);
});
