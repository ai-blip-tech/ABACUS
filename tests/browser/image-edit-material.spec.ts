import { expect, test } from "@playwright/test";

const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("global image edit and material restyling remain composable with local tools", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const requests: Array<Record<string, unknown>> = [];

  await page.route("**/api/account/overview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      projects: [],
      generations: [{ id: "edit-source", operation: "generate", created_at: new Date().toISOString(), total_tokens: 42 }],
      summary: { generation_count: 1, total_tokens: 42, cost_usd: 0 },
    }),
  }));
  await page.route("**/api/account/generations/edit-source", (route) => route.fulfill({ status: 200, contentType: "image/png", body: imageBytes }));
  await page.route("**/api/segment", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ polygons: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }) }));
  await page.route("**/api/generate", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: "image/png", body: imageBytes });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Material");
  await page.getByLabel("Email логин").fill(`material-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("Material123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.locator(".projects-dashboard-generation").click();

  const brush = page.getByRole("button", { name: "Изменить материал выбранной поверхности" });
  await expect(brush).toHaveCount(0);
  await page.getByRole("button", { name: "Поставить точку размещения предмета" }).click({ position: { x: 250, y: 180 } });
  await expect(brush).toBeVisible();
  await brush.click();
  await expect(page.getByRole("dialog", { name: "Изменить материал" })).toBeVisible();
  await page.getByRole("button", { name: "Выбрать из каталога" }).click();
  await expect(page.getByText("Каталог материалов готовится.")).toBeVisible();
  await page.locator(".material-source-actions input[type=file]").setInputFiles({ name: "green-boucle.png", mimeType: "image/png", buffer: imageBytes });
  await expect(page.getByAltText("Референс материала")).toBeVisible();
  await page.getByRole("button", { name: "Применить материал" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].material).toBeTruthy();
  expect((requests[0].material as Record<string, unknown>).mask).toBeTruthy();
  expect(requests[0].replacement).toBeUndefined();
  await expect(brush).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Действие с мебелью" })).toContainText("ДобавитьЗаменитьУдалить");

  const instruction = "Сделай стены светлее";
  await page.getByPlaceholder("Например: сделай кресло зелёным, убери торшер или добавь человека в кресло").fill(instruction);
  await page.getByRole("button", { name: "Применить изменения" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].globalEdit).toEqual({ instruction });
  expect(requests[1].adjustment).toBeUndefined();
  await expect(page.getByText("Изменение изображения")).toBeVisible();
});
