import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlanogramItemToRoom,
  planogramItemCenterPercent,
  planogramItemPositionBounds,
} from "../lib/planogram-geometry.ts";

const room = { width: 6000, length: 4500 };
const sofa = { x: 0, y: 0, width: 2200, depth: 950, rotation: 90 };

test("a rotated sofa can sit flush against the left wall", () => {
  const bounds = planogramItemPositionBounds(sofa, room);
  const placed = clampPlanogramItemToRoom({ ...sofa, x: -100, y: 20 }, room);
  const visualLeft = placed.x + (bounds.width - bounds.boundingWidth) / 2;

  assert.ok(placed.x < 0, "the unrotated box may extend outside while its rotated contour remains inside");
  assert.ok(Math.abs(visualLeft) < 1e-9);
});

test("all four visible edges remain inside the room at an arbitrary angle", () => {
  const item = { ...sofa, rotation: 37, x: 500, y: -500 };
  const bounds = planogramItemPositionBounds(item, room);
  const placed = clampPlanogramItemToRoom(item, room);
  const visualLeft = placed.x + (bounds.width - bounds.boundingWidth) / 2;
  const visualRight = placed.x + (bounds.width + bounds.boundingWidth) / 2;
  const visualTop = placed.y + (bounds.depth - bounds.boundingDepth) / 2;
  const visualBottom = placed.y + (bounds.depth + bounds.boundingDepth) / 2;

  assert.ok(visualLeft >= -1e-9);
  assert.ok(visualRight <= 100 + 1e-9);
  assert.ok(visualTop >= -1e-9);
  assert.ok(visualBottom <= 100 + 1e-9);
});

test("unrotated placement keeps the original zero-to-room bounds", () => {
  const item = { ...sofa, rotation: 0, x: -10, y: 200 };
  const bounds = planogramItemPositionBounds(item, room);
  const placed = clampPlanogramItemToRoom(item, room);

  assert.equal(bounds.minX, 0);
  assert.equal(bounds.minY, 0);
  assert.equal(placed.x, 0);
  assert.equal(placed.y, bounds.maxY);
});

test("render coordinates use the furniture centre even when its technical top-left is negative", () => {
  const placed = clampPlanogramItemToRoom({ ...sofa, x: -100, y: 20 }, room);
  const center = planogramItemCenterPercent(placed, room);

  assert.ok(center.x >= 0 && center.x <= 100);
  assert.ok(center.y >= 0 && center.y <= 100);
});
