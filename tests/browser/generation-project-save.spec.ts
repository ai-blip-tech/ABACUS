import { expect, test } from "@playwright/test";

const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("a saved generation becomes one reopenable project without duplicate creation", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("-1440"));
  let created = 0;
  let updated = 0;
  let savedBody: Record<string, unknown> | null = null;
  const projectId = `generation-project-${testInfo.project.name}`;
  const projectName = "Проект из генерации";

  await page.route("**/api/account/overview", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        projects: savedBody ? [{ id: projectId, name: projectName, project_type: "Квартира", description: null, preview_image: "/api/account/generations/generation-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] : [],
        generations: [{ id: "generation-1", operation: "generate", created_at: new Date().toISOString(), total_tokens: 42 }],
        summary: { generation_count: 1, total_tokens: 42, cost_usd: 0 },
      }),
    });
  });
  await page.route("**/api/account/generations/generation-1", (route) => route.fulfill({ status: 200, contentType: "image/png", body: imageBytes }));
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    created += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ project: { id: projectId, name: projectName, project_type: "Квартира", created_at: new Date().toISOString() } }) });
  });
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() === "PUT") {
      updated += 1;
      savedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ project: { id: projectId, name: projectName, project_type: "Квартира", description: null }, state: savedBody?.state }) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Save flow");
  await page.getByLabel("Email логин").fill(`save-flow-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("SaveFlow123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();

  await expect(page.locator(".projects-dashboard-generation")).toBeVisible();
  await page.locator(".projects-dashboard-generation").click();
  await expect(page.locator("main.studio-shell")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить проект" }).click();
  await expect(page.getByRole("dialog", { name: "Сохранить как проект" })).toBeVisible();
  await page.getByLabel("Название проекта").fill(projectName);
  await page.getByRole("dialog", { name: "Сохранить как проект" }).getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.locator(".project-save-control")).toHaveText("Сохранено");

  await page.locator(".project-save-control").click();
  await expect.poll(() => updated).toBe(2);
  expect(created).toBe(1);

  await page.getByRole("button", { name: "Проекты" }).click();
  await expect(page.locator(".projects-dashboard-project")).toContainText(projectName);
  await page.locator(".projects-dashboard-project").click();
  await expect(page.locator("main.studio-shell")).toBeVisible();
  await expect(page.locator(".room-canvas img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page).toHaveURL(new RegExp(`\\?project=${projectId}#`));

  await page.reload();
  await expect(page.locator("main.studio-shell")).toBeVisible();
  await expect(page.locator(".room-canvas img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();
  expect(created).toBe(1);
});

test("an uploaded project interior survives reload before a manual save click", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("-1440"));
  let savedBody: Record<string, unknown> | null = null;
  let savedProjectId = "";
  const projectName = `Reload upload ${testInfo.project.name}`;

  await page.route("**/api/account/overview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ projects: [], generations: [], summary: { generation_count: 0, total_tokens: 0, cost_usd: 0 } }),
  }));
  await page.route("**/api/projects/*", async (route) => {
    const url = new URL(route.request().url());
    savedProjectId = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ project: { id: savedProjectId, name: projectName, project_type: "Квартира", description: null }, state: savedBody?.state }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Имя обязательно").fill("Reload upload");
  await page.getByLabel("Email логин").fill(`reload-upload-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("ReloadUpload123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.getByRole("button", { name: /Создать проект/ }).first().click();
  await page.getByLabel("НАЗВАНИЕ ПРОЕКТА").fill(projectName);
  await page.getByRole("button", { name: /Создать проект/ }).click();

  await page.locator(".furniture-choice .upload-zone input[type=file]").setInputFiles({ name: "interior.png", mimeType: "image/png", buffer: imageBytes });
  await expect(page.locator(".project-save-control").first()).toHaveText("Сохранено");
  expect(savedProjectId).not.toBe("");
  expect(savedBody).not.toBeNull();

  await page.reload();
  await expect(page.locator("main.studio-shell")).toBeVisible();
  await expect(page.locator(".room-canvas img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();
});
