import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const createProjectCss = await readFile(new URL("../app/create-project.css", import.meta.url), "utf8");
const dashboardCss = await readFile(new URL("../app/account-dashboard-concept-d.css", import.meta.url), "utf8");
const dropdownCss = await readFile(new URL("../app/account-dropdown.css", import.meta.url), "utf8");

test("keeps a vh fallback before dynamic viewport units", () => {
  assert.match(createProjectCss, /min-height:\s*100vh;\s*min-height:\s*100dvh;/);
  assert.match(createProjectCss, /min-height:\s*calc\(100vh - 76px\);\s*min-height:\s*calc\(100dvh - 76px\);/);
  assert.match(dashboardCss, /min-height:100vh;\s*min-height:100dvh;/);
  assert.match(dropdownCss, /max-height:calc\(100vh - 80px\);max-height:calc\(100dvh - 80px\)/);
});
