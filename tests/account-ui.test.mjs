import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const menuSource = await readFile(new URL("../app/account-menu.tsx", import.meta.url), "utf8");
const accountSource = await readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const paymentRouteSource = await readFile(new URL("../app/api/account/payments/route.ts", import.meta.url), "utf8");
const adminPlanRouteSource = await readFile(new URL("../app/api/admin/users/[id]/plan/route.ts", import.meta.url), "utf8");
const tokenHistoryRouteSource = await readFile(new URL("../app/api/account/token-history/route.ts", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("authenticated avatar opens the account menu instead of logging the user out", () => {
  assert.match(homeSource, /<AccountMenu/);
  assert.doesNotMatch(homeSource, /className="avatar"[^>]+auth\/logout/);
  for (const label of ["Личный кабинет", "Тариф и токены", "История", "Безопасность", "Выйти"]) {
    assert.match(menuSource, new RegExp(label));
  }
  assert.match(menuSource, /\/account#profile/);
});

test("account page exposes working profile, billing, history and security sections", () => {
  for (const id of ["profile", "plan", "token-history", "generation-history", "security"]) {
    assert.ok(accountSource.includes(`, "${id}"]`), `missing account section ${id}`);
  }
  assert.match(accountSource, /\/api\/account\/profile/);
  assert.match(accountSource, /\/api\/account\/change-password/);
  assert.match(accountSource, /FREE · без списания/);
  assert.match(accountSource, /calculatedTokenCost/);
  assert.match(accountSource, /actualDebit/);
  assert.match(accountSource, /previewUrl/);
  assert.match(accountSource, /paymentsEnabled &&/);
  assert.doesNotMatch(accountSource, /Tenant memberships|tenant membership|mock|scaffold/i);
});

test("account navigation returns to projects and does not expose disabled payment sections", () => {
  assert.match(accountSource, /href="\/\?view=projects"/);
  assert.match(homeSource, /decodeURIComponent\(window\.location\.hash\)/);
  assert.match(homeSource, /hash === "#кабинет"/);
  assert.match(homeSource, /requestedView === "projects"/);
  assert.doesNotMatch(menuSource, /account#settings|Настройки/);
  assert.match(menuSource, /account#security/);
  assert.match(paymentRouteSource, /export async function POST/);
});

test("plan assignment is global-admin protected and token history separates calculation from debit", () => {
  assert.match(adminPlanRouteSource, /requireGlobalAdmin/);
  assert.match(adminPlanRouteSource, /assignPlanToUser/);
  assert.match(tokenHistoryRouteSource, /calculatedTokenCost/);
  assert.match(tokenHistoryRouteSource, /actualDebit/);
  assert.match(tokenHistoryRouteSource, /balanceAfter/);
});

test("admin shell is gated by the verified global role before admin data is requested", () => {
  assert.match(adminSource, /fetch\("\/api\/auth\/me"\)/);
  assert.match(adminSource, /payload\.user\.role!=="admin"/);
  assert.match(adminSource, /if\(access!=="admin"\)return <AdminAccess/);
  assert.match(adminSource, /Этот раздел доступен только администратору Room Design/);
  assert.match(adminSource, /\?auth=login&returnTo=\/admin/);
  assert.ok(adminSource.indexOf('payload.user.role!=="admin"') < adminSource.indexOf("await load()"));
});

test("mobile studio reuses the inspector as a keyboard-dismissible bottom sheet", () => {
  assert.match(homeSource, /mobileInspectorOpen/);
  assert.match(homeSource, /aria-controls="studio-inspector"/);
  assert.match(homeSource, /event\.key==="Escape"/);
  assert.match(homeSource, /id="studio-inspector"/);
  assert.match(globalCss, /\.studio \.inspector\.mobile-open/);
  assert.match(globalCss, /max-height:min\(82vh,700px\)/);
});

test("deep links hydrate from one stable initial tree and guest account opens login directly", () => {
  assert.match(homeSource, /useState<HomeView>\("home"\)/);
  assert.match(homeSource, /routeReady/);
  assert.match(homeSource, /setTimeout\(\(\)=>\{const nextView=initialHomeView/);
  assert.match(accountSource, /\?auth=login&returnTo=\/account/);
  assert.match(homeSource, /используется для входа/);
});

test("planogram templates have stable unique keys", () => {
  assert.doesNotMatch(homeSource, /key=\{item\.kind\}/);
  assert.match(homeSource, /key=\{`\$\{item\.kind\}:\$\{item\.name\}`\}/);
});
