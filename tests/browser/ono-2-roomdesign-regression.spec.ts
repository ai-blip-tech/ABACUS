import { expect, test } from "@playwright/test";

const assistantRoutes = ["/templates", "/templates/design-battle", "/account", "/admin"];

test("Ono 2.0 uses one hero instance on the landing and one floating instance on application pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".it-orb")).toHaveCount(0);
  await expect(page.locator(".it-hero-orb")).toHaveCount(1);
  await expect(page.locator(".ono-orb-canvas")).toHaveCount(1);
  await expect(page.locator(".home-hero-video")).toHaveCount(0);

  for (const route of assistantRoutes) {
    await page.goto(route);
    await expect(page.locator(".it-orb")).toHaveCount(1);
    await expect(page.locator(".it-hero-orb")).toHaveCount(0);
    await expect(page.locator("[data-ono-widget]")).toHaveCount(0);
  }
});

test("homepage suggestion fills the shared composer without sending a request", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Как создать интерьер по фотографии?" }).click();
  await expect(page.getByLabel("Сообщение для ОНО")).toHaveValue("Как создать интерьер по фотографии?");
  await expect(page.locator(".it-message")).toHaveCount(0);
});

test("homepage keeps one compact project action and no audience switch on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Начать проект →" })).toHaveCount(1);
  await expect(page.locator(".home-project-copy")).toBeHidden();
  await expect(page.locator(".home-audience-switch")).toHaveCount(0);
  await expect(page.locator(".templates-nav nav")).toBeHidden();
});

test("homepage hero stays inside the viewport at the five acceptance sizes", async ({ page }) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".it-hero-orb")).toBeVisible();
    await expect(page.locator(".ono-orb-canvas")).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("Ono 2.0 keeps the approved UI and accepts a local image without generating", async ({ page }) => {
  await page.goto("/templates/design-battle");
  await page.getByRole("button", { name: /Открыть Оно/ }).click();
  await expect(page.getByRole("region", { name: "Разговор с Оно" })).toBeVisible();
  await expect(page.getByLabel("Сообщение для Оно")).toBeVisible();
  await expect(page.getByRole("button", { name: "Прикрепить изображение" })).toBeVisible();
  await page.getByRole("region", { name: "Разговор с Оно" }).locator("input[type=file]").setInputFiles({
    name: "room.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZPWQAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByText("Изображение прикреплено")).toBeVisible();
  await expect(page.locator(".it-message")).toHaveCount(0);
  await page.getByRole("button", { name: "Убрать изображение" }).click();
  await expect(page.getByText("Изображение прикреплено")).toHaveCount(0);
});

test("template and catalog pages expose contextual Ono suggestions", async ({ page }) => {
  await page.goto("/templates");
  await page.getByRole("button", { name: /Открыть Оно/ }).click();
  await expect(page.getByText("Какой шаблон поможет с моей задачей?")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть Оно" }).click();

  await page.goto("/templates/light-scenarios");
  await page.getByRole("button", { name: /Открыть Оно/ }).click();
  await expect(page.getByText("Как работает шаблон «Сценарии света»?")).toBeVisible();
});
