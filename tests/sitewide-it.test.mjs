import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const sitewide = await readFile(new URL("../app/sitewide-it.tsx", import.meta.url), "utf8");
const itOrb = await readFile(new URL("../app/it-orb.tsx", import.meta.url), "utf8");
const templatesHome = await readFile(new URL("../app/templates-home.tsx", import.meta.url), "utf8");
const templatesHomeCss = await readFile(new URL("../app/templates-home-v2.css", import.meta.url), "utf8");
const agent = await readFile(new URL("../lib/it/agent.ts", import.meta.url), "utf8");
const knowledge = await readFile(new URL("../lib/it/product-knowledge.ts", import.meta.url), "utf8");

test("Ono is mounted once at the app layout and uses the hero placement on the public landing", () => {
  assert.match(layout, /<SitewideIt\/>/);
  assert.doesNotMatch(home, /<ItOrb\b/);
  assert.match(sitewide, /context\.page === "landing"/);
  assert.match(sitewide, /createPortal\(ono, heroTarget\)/);
  assert.match(sitewide, /placement=\{context\.page === "landing" \? "hero" : "floating"\}/);
  assert.match(sitewide, /Как создать интерьер по фотографии/);
  assert.match(sitewide, /roomdesign:it-context/);
  assert.match(sitewide, /headerTitle="«ОНО» - Ваш ИИ-ассистент"/);
  assert.match(home, /roomdesign:it-context/);
});

test("homepage suggestions fill the shared composer without submitting", () => {
  assert.match(itOrb, /placement\?: "floating" \| "hero"/);
  assert.match(itOrb, /className="it-hero"/);
  assert.match(itOrb, /setValue\(suggestion\)/);
  assert.doesNotMatch(itOrb, /setValue\(suggestion\);\s*void ask\(suggestion\)/);
  assert.match(itOrb, /Спросите «ОНО», загрузите пространство или опишите задачу/);
  assert.match(templatesHome, /id="home-ono-slot"/);
  assert.match(templatesHomeCss, /\.it-hero-orb/);
  assert.match(templatesHomeCss, /@media\(max-width:760px\).*\.home-project-copy,\.home-project-action>p\{display:none\}/s);
});

test("template catalog and template workspaces receive contextual assistant prompts", () => {
  assert.match(sitewide, /pathname === "\/templates"/);
  assert.match(sitewide, /pathname\.startsWith\("\/templates\/"\)/);
  assert.match(sitewide, /Как работает шаблон/);
  assert.match(sitewide, /Какой шаблон поможет с моей задачей/);
  assert.match(sitewide, /template\.inputSlots\.map/);
  assert.match(agent, /CURRENT_ROOM_DESIGN_CONTEXT=/);
  assert.match(agent, /roomDesignProductKnowledgePromptFor\(input\.context\)/);
  assert.match(knowledge, /Не показывай пользователю внутренние lifecycle-метки разработки/);
});

test("Ono remains available on account, admin and proposal routes", () => {
  assert.match(sitewide, /pathname === "\/account"/);
  assert.match(sitewide, /pathname === "\/admin"/);
  assert.match(sitewide, /pathname\.startsWith\("\/proposal\/"\)/);
});
