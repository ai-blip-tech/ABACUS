import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/create-project.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../app/concept-d.css", import.meta.url), "utf8");

test("Concept D create-project page preserves the existing project handoff", () => {
  assert.match(page, /setProjectId\(crypto\.randomUUID\(\)\)/);
  assert.match(page, /setProjectSaved\(false\)/);
  assert.match(page, /navigate\("studio"\)/);
  assert.match(page, /<option>Квартира<\/option><option>Дом<\/option><option>Офис<\/option><option>Гостеприимство<\/option><option>Другое<\/option>/);
});

test("create-project validation is inline and accessible", () => {
  assert.match(page, /<form className="project-form" noValidate/);
  assert.match(page, /aria-invalid=\{Boolean\(projectError\)\}/);
  assert.match(page, /aria-describedby=\{projectError \? "project-name-error" : undefined\}/);
  assert.match(page, /id="project-name-error" className="project-error" role="alert"/);
  assert.match(page, /const name = projectName\.trim\(\)/);
});

test("Concept D create-project shell keeps the approved layout and typography tokens", () => {
  assert.match(page, /src="\/concept-d-create-project-hero\.png" alt=""/);
  assert.doesNotMatch(page, /generated-bleed-runner\.png/);
  assert.match(styles, /grid-template-columns: minmax\(0, 61fr\) minmax\(440px, 39fr\)/);
  assert.match(styles, /padding: clamp\(48px, 4vw, 58px\).*clamp\(88px, 11vw, 170px\)/);
  assert.match(styles, /\.project-label-row \{[\s\S]*flex-direction: column/);
  assert.match(styles, /\.project-page-concept \.project-field textarea \{[\s\S]*resize: none/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(tokens, /--rd-oxblood: #7b1020/);
  assert.match(tokens, /--rd-display: "Cormorant Garamond"/);
  assert.match(tokens, /--rd-wordmark: var\(--rd-display\)/);
});
