import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const imageBytes = await readFile(new URL("../../public/generated-bleed-runner.png", import.meta.url));

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
  await page.route("**/api/segment", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ polygons: [[[300, 220], [650, 220], [650, 600], [300, 600]]] }) }));
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
  const materialMenu = page.getByRole("dialog", { name: "Изменить материал" });
  await expect(materialMenu).toBeVisible();
  const menuMetrics = await materialMenu.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const firstAction = element.querySelector("button");
    return { width: box.width, height: box.height, actionSize: firstAction ? Number.parseFloat(getComputedStyle(firstAction).fontSize) : 0 };
  });
  expect(menuMetrics.width).toBeLessThanOrEqual(118);
  expect(menuMetrics.height).toBeLessThan(90);
  expect(menuMetrics.actionSize).toBeLessThanOrEqual(8.5);
  await materialMenu.getByRole("button", { name: "Добавить из каталога", exact: true }).click();
  await expect(page.getByText("Каталог материалов готовится.")).toBeVisible();
  await expect(materialMenu).toHaveCount(0);
  await brush.click();
  await expect(materialMenu).toBeVisible();
  await page.locator(".material-reference-input").setInputFiles({ name: "yellow-boucle.png", mimeType: "image/png", buffer: imageBytes });
  await expect.poll(() => requests.length).toBe(1);

  const assertMaterialRequest = (request: Record<string, unknown>) => {
    expect(request.operation).toBe("material");
    expect(request.material).toBeTruthy();
    expect((request.material as Record<string, unknown>).mask).toBeTruthy();
    expect(request.referenceImage).toBeTruthy();
    expect(request.placement).toBeUndefined();
    expect(request.replacement).toBeUndefined();
    expect(request.removal).toBeUndefined();
  };
  assertMaterialRequest(requests[0]);

  const furnitureActions = page.getByRole("group", { name: "Действие с мебелью" });
  await furnitureActions.getByRole("button", { name: "Заменить" }).click();
  await page.getByRole("button", { name: "Поставить точку в центре предмета для замены" }).click({ position: { x: 250, y: 180 } });
  await brush.click();
  await expect(materialMenu).toBeVisible();
  await page.locator(".material-reference-input").setInputFiles({ name: "yellow-boucle.png", mimeType: "image/png", buffer: imageBytes });
  await expect.poll(() => requests.length).toBe(2);
  assertMaterialRequest(requests[1]);

  await furnitureActions.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("button", { name: "Поставить точку на предмете для удаления" }).click({ position: { x: 250, y: 180 } });
  await brush.click();
  await expect(materialMenu).toBeVisible();
  await page.locator(".material-reference-input").setInputFiles({ name: "yellow-boucle.png", mimeType: "image/png", buffer: imageBytes });
  await expect.poll(() => requests.length).toBe(3);
  assertMaterialRequest(requests[2]);

  await expect(brush).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Действие с мебелью" })).toContainText("ДобавитьЗаменитьУдалить");

  const instruction = "Сделай стены светлее";
  await page.getByPlaceholder("Например: сделай кресло зелёным, убери торшер или добавь человека в кресло").fill(instruction);
  await page.getByRole("button", { name: "Применить изменения" }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3].globalEdit).toEqual({ instruction });
  expect(requests[3].adjustment).toBeUndefined();
  await expect(page.getByText("Изменение изображения")).toBeVisible();
});
