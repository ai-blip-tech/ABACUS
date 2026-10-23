import { expect, test } from "@playwright/test";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const projectId = "editor-reopen-regression";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: "editor-user", email: "editor@example.test", firstName: "Иван", lastName: "Петров", role: "user" } } }));
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: [{ id: projectId, name: "Сохранённый проект" }] } }));
  await page.route(`**/api/projects/${projectId}`, route => route.fulfill({ json: { project: { id: projectId, name: "Сохранённый проект", project_type: "Квартира" }, state: { interiorImage: image, interiorName: "Интерьер", historyVersions: [{ id: "version-1", image, name: "Интерьер", generated: true }], activeHistoryId: "version-1" } } }));
  await page.route("**/api/catalog?**", route => route.fulfill({ json: { products: [], total: 0 } }));
});

test("saved project without preview URL opens the new catalog before and after reload", async ({ page }) => {
  await page.goto(`/?project=${projectId}#студия`);
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(page.locator(".studio-material-tray")).toBeVisible();
    await expect(page.locator(".studio-bottom-catalog")).toHaveCount(0);
    await page.getByRole("button", { name: /Выбрать из каталога/ }).click();
    await expect(page.getByRole("heading", { name: "Каталог мебели" })).toBeVisible();
    await page.getByRole("button", { name: "← Вернуться в проект" }).click();
    if (!attempt) await page.reload();
  }
});

test("main interior image supports download, fullscreen and Escape without setting an edit point", async ({ page }) => {
  await page.goto(`/?project=${projectId}#студия`);
  const actions = page.locator(".room-canvas .editor-image-actions");
  await expect(actions).toBeVisible();
  await expect(page.locator(".history-download")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await actions.getByRole("button", { name: "Скачать изображение", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
  await actions.getByRole("button", { name: "Открыть изображение на весь экран" }).click();
  const dialog = page.getByRole("dialog", { name: "Полноэкранный просмотр изображения" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveAttribute("src", image);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".studio-point-menu")).toHaveCount(0);
});

test("technical light shares the header and image actions with the interior editor", async ({ page }) => {
  await page.route("**/api/lighting/generate/status", route => route.fulfill({ json: { configured: true } }));
  await page.route("**/api/lighting/catalog?**", route => route.fulfill({ json: { products: [], total: 0 } }));
  await page.route(`**/api/projects/${projectId}/technical-lighting`, route => route.fulfill({ json: { project: { id: projectId, name: "Сохранённый проект" }, technicalLighting: { photo: image, photoName: "Технический свет", photoRatio: 1 } } }));
  await page.goto(`/technical-lighting?project=${projectId}`);
  await expect(page.locator(".editor-header .room-design-wordmark")).toBeVisible();
  await page.getByRole("button", { name: "Редактор изображений", exact: true }).click();
  // Upload is independent of whether the saved project has lighting data.
  await page.locator("input[type=file]").first().setInputFiles({ name: "lighting.png", mimeType: "image/png", buffer: Buffer.from(image.split(",")[1], "base64") });
  const actions = page.locator(".folio-photo .editor-image-actions");
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "Открыть изображение на весь экран" }).click();
  await expect(page.getByRole("dialog", { name: "Полноэкранный просмотр изображения" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть полноэкранный просмотр" }).click();
  const download = page.waitForEvent("download");
  await actions.getByRole("button", { name: "Скачать изображение", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
  await page.getByRole("button", { name: "← Меню проекта" }).click();
  await expect(page).toHaveURL(new RegExp(`project=${projectId}#`));
});
