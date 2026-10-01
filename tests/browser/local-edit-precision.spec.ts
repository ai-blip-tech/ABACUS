import { expect, test } from "@playwright/test";
import sharp from "sharp";

const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } } }).png().toBuffer();
const edited = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 220, g: 10, b: 15, alpha: 1 } } }).png().toBuffer();

test("Add, Replace and Remove use a local crop and preserve the original scene outside the mask", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium-1440");
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/account/overview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ projects: [], generations: [{ id: "precision-source", operation: "generate", created_at: new Date().toISOString() }], summary: { generation_count: 1, total_tokens: 0, cost_usd: 0 } }),
  }));
  await page.route("**/api/account/generations/precision-source", (route) => route.fulfill({ status: 200, contentType: "image/png", body: source }));
  await page.route("**/api/segment", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ polygons: [[[10, 10], [45, 10], [45, 45], [10, 45]]] }) }));
  await page.route("**/api/generate", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: "image/png", body: edited });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Precision");
  await page.getByLabel("Email логин").fill(`precision-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("Precision123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.locator(".projects-dashboard-generation").click();
  await page.locator(".direct-reference-input").setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: source });

  const selectPoint = async (label: string) => page.getByRole("button", { name: label }).click({ position: { x: 250, y: 180 } });
  const preservedCorner = async () => page.locator(".room-canvas > img").evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return [...canvas.getContext("2d")!.getImageData(90, 90, 1, 1).data];
  });
  const assertLocalRequest = async (index: number, operation: "placement" | "replacement" | "removal") => {
    await expect.poll(() => requests.length).toBe(index + 1);
    const request = requests[index];
    expect(request[operation]).toBeTruthy();
    const room = await sharp(Buffer.from(String(request.roomImage).split(",")[1], "base64")).metadata();
    const mask = await sharp(Buffer.from(String((request[operation] as { mask: string }).mask).split(",")[1], "base64")).metadata();
    expect(room.width).toBeLessThan(100);
    expect(room.height).toBeLessThan(100);
    expect(mask.width).toBe(room.width);
    expect(mask.height).toBe(room.height);
    await expect.poll(preservedCorner).toEqual([20, 40, 60, 255]);
  };

  await selectPoint("Поставить точку размещения предмета");
  await page.getByRole("button", { name: "Создать интерьер" }).click();
  await assertLocalRequest(0, "placement");

  await page.locator(".room-canvas").hover();
  await page.getByRole("group", { name: "Действие с мебелью" }).getByRole("button", { name: "Заменить" }).click();
  await selectPoint("Поставить точку в центре предмета для замены");
  await page.getByRole("button", { name: "Создать интерьер" }).click();
  await assertLocalRequest(1, "replacement");

  await page.locator(".room-canvas").hover();
  const remove = page.getByRole("group", { name: "Действие с мебелью" }).getByRole("button", { name: "Удалить" });
  await remove.click();
  await selectPoint("Поставить точку на предмете для удаления");
  await expect(page.getByRole("button", { name: "Изменить материал выбранной поверхности" })).toBeVisible();
  await remove.click();
  await assertLocalRequest(2, "removal");

  await page.route("**/api/segment", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ polygons: [[[0, 0], [100, 0], [100, 100], [0, 100]]] }) }));
  await page.locator(".room-canvas").hover();
  await page.getByRole("group", { name: "Действие с мебелью" }).getByRole("button", { name: "Заменить" }).click();
  await selectPoint("Поставить точку в центре предмета для замены");
  await page.getByRole("button", { name: "Создать интерьер" }).click();
  await expect(page.getByText("Контур захватывает лишнюю область или не содержит выбранную точку. Выберите предмет ещё раз.").first()).toBeVisible();
  expect(requests).toHaveLength(3);

  await page.getByRole("button", { name: "Изменить материал выбранной поверхности" }).click();
  const materialMenu = page.getByRole("dialog", { name: "Изменить материал" });
  await expect(materialMenu).toBeVisible();
  await expect(page.locator(".material-reference-input")).toBeAttached();
  expect(requests).toHaveLength(3);
  await page.locator(".material-reference-input").setInputFiles({ name: "material.png", mimeType: "image/png", buffer: source });
  await expect(page.getByText("Не удалось определить выбранный объект. Поставьте точку ближе к центру объекта и попробуйте ещё раз.").first()).toBeVisible();
  await expect(materialMenu).toBeVisible();
  expect(requests).toHaveLength(3);
});
