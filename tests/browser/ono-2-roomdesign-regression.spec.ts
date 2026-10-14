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

test("homepage uses the approved neutral background and responsive project dividers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const desktopStyles = await page.evaluate(() => {
    const project = document.querySelector(".home-project-environment");
    const divider = document.querySelector(".home-project-divider");
    if (!(project instanceof HTMLElement) || !(divider instanceof HTMLElement)) throw new Error("Project environment is missing");
    return {
      body: getComputedStyle(document.body).backgroundColor,
      hero: getComputedStyle(document.querySelector(".home-ono-hero")!).backgroundColor,
      project: getComputedStyle(project).backgroundColor,
      templates: getComputedStyle(document.querySelector(".home-template-entry")!).backgroundColor,
      topHeight: getComputedStyle(project, "::before").height,
      topColor: getComputedStyle(project, "::before").backgroundColor,
      bottomHeight: getComputedStyle(project, "::after").height,
      bottomColor: getComputedStyle(project, "::after").backgroundColor,
      dividerDisplay: getComputedStyle(divider).display,
      dividerWidth: getComputedStyle(divider).width,
      dividerColor: getComputedStyle(divider).backgroundColor,
    };
  });
  expect(desktopStyles).toEqual({
    body: "rgb(252, 252, 251)",
    hero: "rgb(252, 252, 251)",
    project: "rgb(252, 252, 251)",
    templates: "rgb(252, 252, 251)",
    topHeight: "1px",
    topColor: "rgb(218, 219, 224)",
    bottomHeight: "1px",
    bottomColor: "rgb(225, 225, 227)",
    dividerDisplay: "block",
    dividerWidth: "1px",
    dividerColor: "rgb(212, 214, 218)",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".home-project-divider")).toBeHidden();
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
