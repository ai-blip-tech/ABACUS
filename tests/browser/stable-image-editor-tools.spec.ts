import { expect, test } from "@playwright/test";

const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("stable Add, Replace and Remove request routing remains unchanged", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const requests: Array<Record<string, unknown>> = [];

  await page.route("**/api/account/overview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      projects: [],
      generations: [{ id: "stable-tools-source", operation: "generate", created_at: new Date().toISOString() }],
      summary: { generation_count: 1, total_tokens: 0, cost_usd: 0 },
    }),
  }));
  await page.route("**/api/account/generations/stable-tools-source", (route) => route.fulfill({ status: 200, contentType: "image/png", body: imageBytes }));
  await page.route("**/api/generate", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: "image/png", body: imageBytes });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Stable tools");
  await page.getByLabel("Email логин").fill(`stable-tools-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("StableTools123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.locator(".projects-dashboard-generation").click();

  const actions = page.getByRole("group", { name: "Действие с мебелью" });
  const uploadReference = async () => page.locator(".direct-reference-input").setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: imageBytes });

  await uploadReference();
  await page.getByRole("button", { name: "Поставить точку размещения предмета" }).click({ position: { x: 250, y: 180 } });
  await page.getByRole("button", { name: "Создать интерьер" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].placement).toBeTruthy();
  expect(requests[0].replacement).toBeUndefined();
  expect(requests[0].removal).toBeUndefined();
  expect(requests[0].operation).toBeUndefined();

  await page.locator(".room-canvas").hover();
  await actions.getByRole("button", { name: "Заменить" }).click();
  await uploadReference();
  await page.getByRole("button", { name: "Поставить точку в центре предмета для замены" }).click({ position: { x: 250, y: 180 } });
  await page.getByRole("button", { name: "Создать интерьер" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].replacement).toBeTruthy();
  expect(requests[1].placement).toBeTruthy();
  expect(requests[1].removal).toBeUndefined();
  expect(requests[1].operation).toBeUndefined();

  await page.locator(".room-canvas").hover();
  await actions.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("button", { name: "Поставить точку на предмете для удаления" }).click({ position: { x: 250, y: 180 } });
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].removal).toBeTruthy();
  expect(requests[2].placement).toBeUndefined();
  expect(requests[2].replacement).toBeUndefined();
  expect(requests[2].operation).toBeUndefined();
});
