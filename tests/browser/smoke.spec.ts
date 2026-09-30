import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => ({ selector: `${element.tagName.toLowerCase()}.${element.className}`, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) }))
      .filter((element) => element.right > document.documentElement.clientWidth + 1)
      .slice(0, 5),
  }));
  expect(sizes.content, `horizontal overflow: ${JSON.stringify(sizes)}`).toBeLessThanOrEqual(sizes.viewport + 1);
}

test("landing, auth, projects, account dropdown, account and Studio", async ({ page, browserName }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const remoteFontRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFontRequests.push(request.url());
  });

  const suffix = `${browserName}-${testInfo.project.name}-${Date.now()}`;
  const email = `smoke-${suffix}@example.com`;
  const password = "CrossBrowser123!";

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ваш интерьер/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Войдите в аккаунт" })).toBeVisible();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Smoke");
  await page.getByLabel("Email логин").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();

  await expect(page.getByRole("heading", { name: /Ваши проекты, Smoke/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Продолжить работу" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const accountTrigger = page.getByRole("button", { name: /Меню пользователя/ });
  await accountTrigger.click();
  await expect(page.getByRole("link", { name: /Личный кабинет/ })).toBeVisible();
  await page.getByRole("link", { name: /Личный кабинет/ }).click();
  await expect(page).toHaveURL(/\/account#profile$/);
  await expect(page.locator(".account-shell")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.evaluate(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByLabel("Email логин").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("dialog", { name: "Вход и регистрация" }).getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Ваши проекты, Smoke/ })).toBeVisible();

  await page.getByRole("button", { name: /Создать проект/ }).first().click();
  await expect(page.getByRole("heading", { name: /Создайте пространство/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("НАЗВАНИЕ ПРОЕКТА").fill(`Smoke ${testInfo.project.name}`);
  await page.getByRole("button", { name: /Создать проект/ }).click();

  await expect(page.locator("main.studio-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: "Редактор изображений" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создание интерьера" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Меню пользователя/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(remoteFontRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes("Failed to load resource"))).toEqual([]);
});
