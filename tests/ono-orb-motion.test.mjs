import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const visual = await readFile(new URL("../app/ono-orb.tsx", import.meta.url), "utf8");
const integration = await readFile(new URL("../app/it-orb.tsx", import.meta.url), "utf8");

test("Ono keeps one delta-time WebGL loop alive for visible idle motion", () => {
  assert.match(visual, /elapsed \+= rawDelta/);
  assert.match(visual, /frame = requestAnimationFrame\(draw\)/);
  assert.match(visual, /document\.hidden/);
  assert.match(visual, /1000 \/ 30/);
});

test("Ono schedules four exclusive weighted idle events with calm gaps", () => {
  assert.match(visual, /weighted = \[1, 1, 1, 1, 2, 2, 4, 4, 3\]/);
  assert.match(visual, /idleGapDuration = 3 \+ random\(\) \* 4/);
  assert.match(visual, /idleScenario === 0/);
  for (const scenario of [1, 2, 3, 4]) assert.match(visual, new RegExp(`scenario === ${scenario}`));
});

test("hover, open-ready and composing are visual-only states wired to real input", () => {
  for (const state of ["hoverReady", "openReady", "composing"]) {
    assert.match(visual, new RegExp(`"${state}"`));
    assert.match(integration, new RegExp(`"${state}"`));
  }
  assert.match(integration, /onPointerEnter/);
  assert.match(integration, /:focus-visible/);
  assert.match(integration, /open && value\.trim\(\)/);
});

test("ready material transitions inside the shader and reduced motion stays animated", () => {
  assert.match(visual, /vec3\(\.137,\.027,\.051\)/);
  assert.match(visual, /vec3\(\.337,\.063,\.106\)/);
  assert.match(visual, /smoothReady \+=/);
  assert.match(visual, /live\.reducedMotion \? \.42 : 1/);
});
