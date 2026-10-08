import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [styles, home, templatesHeader, account, admin, proposal, studio] = await Promise.all([
  readFile(new URL("../app/wordmark.css", import.meta.url), "utf8"),
  readFile(new URL("../app/templates-home.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/templates/templates-header.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/admin-client.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/proposal/[projectId]/proposal-editor.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("all product mastheads use the homepage Room Design wordmark", () => {
  for (const source of [home, templatesHeader, account, admin, proposal]) {
    assert.match(source, /className="[^"]*room-design-wordmark[^"]*"[^>]*>ROOM DESIGN</);
  }
  assert.match(studio, /project-wordmark room-design-wordmark/);
  assert.match(studio, /wordmark room-design-wordmark/);
  assert.match(studio, /projects-dashboard-header"><strong className="room-design-wordmark"/);
  assert.doesNotMatch(admin, /ROOM <span>admin<\/span>/);
  assert.doesNotMatch(proposal, /ROOM<span>DESIGN<\/span>/);
});

test("the shared wordmark keeps the homepage type and masthead geometry", () => {
  assert.match(styles, /font-family: var\(--font-cormorant-garamond\)/);
  assert.match(styles, /font-size: clamp\(27px, 2\.4vw, 40px\)/);
  assert.match(styles, /font-weight: 500/);
  assert.match(styles, /letter-spacing: -1\.8px/);
  assert.match(styles, /--room-design-header-height: 74px/);
  assert.match(styles, /--room-design-header-gutter: clamp\(18px, 3vw, 44px\)/);
});
