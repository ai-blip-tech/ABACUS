import { expect, test } from "@playwright/test";

const assistantRoutes = ["/templates", "/templates/design-battle", "/account", "/admin"];

test("Ono 2.0 is absent on the public landing and mounted once on application pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".it-orb")).toHaveCount(0);

  for (const route of assistantRoutes) {
    await page.goto(route);
    await expect(page.locator(".it-orb")).toHaveCount(1);
    await expect(page.locator("[data-ono-widget]")).toHaveCount(0);
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
