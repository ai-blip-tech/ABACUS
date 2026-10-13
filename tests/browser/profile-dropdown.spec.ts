import { expect, test } from "@playwright/test";

const previewUser = {
  id: "profile-menu-user",
  email: "kirill.administrator.with.a.very.long.email@roomdesign.example.com",
  role: "admin",
  firstName: "Кирилл Александрович",
  lastName: "Администратор Очень Длинная Фамилия",
  phone: "",
  companyRole: "",
  features: { payments: true },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: previewUser }),
  }));
  await page.route("**/api/account/overview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ projects: [], generations: [], summary: { generation_count: 0, total_tokens: 0, cost_usd: 0 } }),
  }));
  await page.route("**/api/projects", (route) => route.fulfill({ contentType: "application/json", body: "{\"projects\":[]}" }));
});

test("profile menu is compact, ordered and keyboard dismissible", async ({ page }, testInfo) => {
  test.skip(!["chromium-1440", "chromium-mobile"].includes(testInfo.project.name));
  await page.goto("/#кабинет");

  const trigger = page.locator(".dashboard-account-trigger");
  await trigger.click();
  const menu = page.locator("#account-profile-menu");
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const labels = await menu.locator("nav a").allTextContents();
  expect(labels).toEqual(["Личный кабинет", "Мои проекты", "Шаблоны", "История рендеров", "Платежи", "Настройки", "Безопасность"]);
  expect(labels.some((label) => /^\d{2}/.test(label.trim()))).toBe(false);

  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  if (testInfo.project.name === "chromium-1440") {
    expect(box!.width).toBeGreaterThanOrEqual(340);
    expect(box!.width).toBeLessThanOrEqual(360);
    expect(box!.height).toBeGreaterThanOrEqual(470);
    expect(box!.height).toBeLessThanOrEqual(520);
  } else {
    expect(box!.width).toBeLessThanOrEqual(360);
    expect(box!.width).toBeLessThanOrEqual(390 - 24);
  }

  for (const row of await menu.locator("nav a").all()) {
    const rowBox = await row.boundingBox();
    expect(rowBox!.height).toBeGreaterThanOrEqual(46);
    expect(rowBox!.height).toBeLessThanOrEqual(50);
  }

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("profile menu closes after selection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440");
  await page.goto("/#кабинет");
  await page.locator(".dashboard-account-trigger").click();
  await page.getByRole("link", { name: "Шаблоны", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator("#account-profile-menu")).toHaveCount(0);
});
