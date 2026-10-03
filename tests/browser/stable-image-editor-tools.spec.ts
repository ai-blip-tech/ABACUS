import { expect, test } from "@playwright/test";

const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("Add, Replace and Remove use point-guided routing without segmentation", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const requests: Array<Record<string, unknown>> = [];
  let segmentRequests = 0;

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
  await page.route("**/api/segment", async (route) => { segmentRequests += 1; await route.abort(); });

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Stable tools");
  await page.getByLabel("Email логин").fill(`stable-tools-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("StableTools123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.locator(".projects-dashboard-generation").click();

  const actions = page.locator(".furniture-action-bar");
  const uploadReference = async () => page.locator(".direct-reference-input").setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: imageBytes });
  const placementButton = page.getByRole("button", { name: "Поставить точку размещения предмета" });

  await page.mouse.move(4, 4);
  await expect(actions).toHaveCSS("opacity", "0");
  await placementButton.click({ position: { x: 250, y: 180 } });
  await page.mouse.move(4, 4);
  await expect(actions).toHaveCSS("opacity", "1");
  await placementButton.click({ position: { x: 250, y: 180 } });
  await page.mouse.move(4, 4);
  await expect(actions).toHaveCSS("opacity", "0");

  await uploadReference();
  await placementButton.click({ position: { x: 250, y: 180 } });
  await page.getByRole("button", { name: "Создать интерьер" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].placement).toBeTruthy();
  expect(requests[0].replacement).toBeUndefined();
  expect(requests[0].removal).toBeUndefined();
  expect(requests[0].operation).toBe("place");
  expect(requests[0].pointEdit).toBeTruthy();
  expect((requests[0].pointEdit as Record<string, unknown>).markedImage).toBeTruthy();

  await page.locator(".room-canvas").hover();
  await actions.getByRole("button", { name: "Заменить" }).click();
  await uploadReference();
  await page.getByRole("button", { name: "Поставить точку в центре предмета для замены" }).click({ position: { x: 250, y: 180 } });
  await page.getByRole("button", { name: "Создать интерьер" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].replacement).toBeTruthy();
  expect(requests[1].placement).toBeUndefined();
  expect(requests[1].removal).toBeUndefined();
  expect(requests[1].operation).toBe("replace");
  expect(requests[1].pointEdit).toBeTruthy();

  await page.locator(".room-canvas").hover();
  await actions.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("button", { name: "Поставить точку на предмете для удаления" }).click({ position: { x: 250, y: 180 } });
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].removal).toBeTruthy();
  expect(requests[2].placement).toBeUndefined();
  expect(requests[2].replacement).toBeUndefined();
  expect(requests[2].operation).toBe("remove");
  expect(requests[2].pointEdit).toBeTruthy();
  expect(segmentRequests).toBe(0);
});

test("Studio keeps history over the canvas and upscale in the first screen", async ({ page }, testInfo) => {
  test.skip(!/-(1440|1366|tablet)$/.test(testInfo.project.name));

  await page.route("**/api/account/overview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      projects: [],
      generations: [{ id: "studio-layout-source", operation: "generate", created_at: new Date().toISOString() }],
      summary: { generation_count: 1, total_tokens: 0, cost_usd: 0 },
    }),
  }));
  await page.route("**/api/account/generations/studio-layout-source", (route) => route.fulfill({ status: 200, contentType: "image/png", body: imageBytes }));

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Studio layout");
  await page.getByLabel("Email логин").fill(`studio-layout-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("StudioLayout123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.locator(".projects-dashboard-generation").click();
  await page.getByRole("button", { name: "Сохранённая генерация", exact: true }).click();

  const canvas = page.locator(".room-canvas");
  const history = page.locator(".history-strip");
  const upscale = page.locator(".upscale-panel");
  await expect(canvas).toBeVisible();
  await expect(history).toBeVisible();
  await expect(upscale).toBeVisible();

  const boxes = await Promise.all([canvas, history, upscale].map((locator) => locator.boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  const [canvasBox, historyBox, upscaleBox] = boxes as NonNullable<(typeof boxes)[number]>[];
  expect(historyBox.y).toBeGreaterThan(canvasBox.y);
  expect(historyBox.y + historyBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
  expect(upscaleBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 1);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(upscaleBox.y + upscaleBox.height).toBeLessThanOrEqual(viewportHeight + 1);
});
