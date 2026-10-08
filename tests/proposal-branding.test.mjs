import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PROPOSAL_BRAND, PROPOSAL_SELECTION_MODULE, isLegacyNorrBrand } from "../lib/proposal-brand.ts";

test("proposal brand constants expose one domain and the official logo spelling", () => {
  assert.equal(PROPOSAL_BRAND.domain, "NORRMOBLER.RU");
  assert.equal(PROPOSAL_BRAND.contactDomain, "norrmobler.ru");
  assert.equal(PROPOSAL_BRAND.officialName, "NORR MØBLER");
  assert.equal(PROPOSAL_BRAND.aboutTitle, "О КОМПАНИИ");
  assert.equal(PROPOSAL_BRAND.aboutLabel, "НАШ ПОДХОД");
  assert.equal(PROPOSAL_BRAND.managerThanks, "СПАСИБО ЗА ВАШ ВЫБОР");
  assert.equal(isLegacyNorrBrand("NORR MÖBLER SELECTION"), true);
  assert.equal(isLegacyNorrBrand("SEYVAA PARIS"), false);
});

test("selection image and information panel share one vertical geometry", () => {
  assert.equal(PROPOSAL_SELECTION_MODULE.pdf.y, 189);
  assert.equal(PROPOSAL_SELECTION_MODULE.pdf.height, 300.5);
  assert.equal(PROPOSAL_SELECTION_MODULE.pptx.y, 105.78 / 72);
  assert.equal(PROPOSAL_SELECTION_MODULE.pptx.height, 300.5 / 72);
});

test("PDF and PPT exports use shared branding and no legacy text renderers", async () => {
  const [pdf, pptx, editor] = await Promise.all([
    readFile(new URL("../app/api/proposal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/proposal/pptx/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/proposal/[projectId]/proposal-editor.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of [pdf, pptx, editor]) {
    assert.doesNotMatch(source, /NORR\s*\/\s*ПЕРСОНАЛЬНАЯ ПОДБОРКА/i);
    assert.doesNotMatch(source, /NORR MÖBLER SELECTION/i);
    assert.doesNotMatch(source, /NORR\s*\/\s*LIVE BEAUTIFULLY/i);
    assert.doesNotMatch(source, /СПАСИБО, ЧТО ВЫБИРАЕТЕ/i);
  }
  assert.match(pdf, /drawImageCover\(visualisationPage/);
  assert.match(pdf, /document\.setAuthor\(PROPOSAL_BRAND\.contactDomain\)/);
  assert.match(pptx, /coverImage\(visual/);
  assert.match(pptx, /pptx\.author = PROPOSAL_BRAND\.contactDomain/);
  assert.match(editor, /managerBrandAsset/);
});
