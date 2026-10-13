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
  await page.getByRole("dialog", { name: "Вход и регистрация" }).getByRole("button", { name: "Зарегистрироваться" }).click();

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

test("planogram save persists through the project API without downloading JSON", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440");
  const projectId = "planogram-save-project";
  let savedBody: { state?: { planItems?: unknown[]; interiorImage?: string } } | null = null;
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-1", email: "plan@example.com", role: "user", firstName: "Plan", lastName: "User" } }),
  }));
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON() as { state?: { planItems?: unknown[]; interiorImage?: string } };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: { id: projectId, name: "Планировка гостиной", project_type: "Квартира", description: null },
        state: {
          planItems: [{ id: "sofa-1", kind: "sofa", name: "Диван", x: 10, y: 10, width: 2200, depth: 950, rotation: 0 }],
          planRoom: { width: 6000, length: 4500 },
        },
      }),
    });
  });

  await page.goto(`/?project=${projectId}#студия`);
  await page.getByRole("button", { name: "Создание интерьера" }).click();
  await page.locator(".planogram-toolbar").getByRole("button", { name: "Сохранить проект" }).click();
  await expect.poll(() => savedBody).not.toBeNull();
  const persisted = savedBody as { state?: { planItems?: unknown[]; interiorImage?: string } } | null;
  expect(persisted?.state?.planItems).toHaveLength(1);
  expect(persisted?.state?.interiorImage).toBe("");
  expect(downloads).toBe(0);
});

test("a rotated planogram item reaches the left wall and keeps its position after save", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440");
  const projectId = "planogram-left-wall";
  let savedState: { planItems?: Array<{ x?: number }> } | null = null;
  await page.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-wall", email: "wall@example.com", role: "user", firstName: "Wall", lastName: "Test" } }),
  }));
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { state?: { planItems?: Array<{ x?: number }> } };
      savedState = body.state || null;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: { id: projectId, name: "У левой стены", project_type: "Квартира" },
        state: savedState || {
          planItems: [{ id: "sofa-wall", kind: "sofa", name: "Диван", x: 20, y: 12, width: 2200, depth: 950, rotation: 90 }],
          planRoom: { width: 6000, length: 4500 },
        },
      }),
    });
  });

  await page.goto(`/?project=${projectId}#студия`);
  await page.getByRole("button", { name: "Создание интерьера" }).click();
  const toolbar = page.locator(".planogram-toolbar");
  await toolbar.getByRole("button", { name: "−" }).click({ clickCount: 3 });
  await expect(toolbar.locator("em")).toHaveText("70%");
  const board = page.locator(".planogram-editor-board");
  const sofa = page.getByRole("button", { name: /Диван: перемещать/ });
  await page.waitForTimeout(350);
  const boardBox = await board.boundingBox();
  const sofaBox = await sofa.boundingBox();
  if (!boardBox || !sofaBox) throw new Error("Планограмма не отрисовалась");
  await page.mouse.move(sofaBox.x + sofaBox.width / 2, sofaBox.y + sofaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(boardBox.x, sofaBox.y + sofaBox.height / 2, { steps: 8 });
  await page.mouse.up();

  const placedBox = await sofa.boundingBox();
  const placedBoard = await board.boundingBox();
  if (!placedBox || !placedBoard) throw new Error("Диван исчез после перемещения");
  const wallInset = await board.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderLeftWidth) || 0);
  expect(Math.abs(placedBox.x - (placedBoard.x + wallInset * .7))).toBeLessThanOrEqual(2);

  await toolbar.getByRole("button", { name: "Сохранить проект" }).click();
  await expect.poll(() => savedState?.planItems?.[0]?.x).toBeLessThan(0);
  await page.reload();
  await page.getByRole("button", { name: "Создание интерьера" }).click();
  const restoredBoard = await board.boundingBox();
  const restoredSofa = await sofa.boundingBox();
  if (!restoredBoard || !restoredSofa) throw new Error("Сохранённая планограмма не восстановилась");
  expect(Math.abs(restoredSofa.x - (restoredBoard.x + wallInset))).toBeLessThanOrEqual(2);
});

test("planogram save creates a named project when no project exists", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440");
  const projectId = "new-planogram-project";
  let created = 0;
  let updated = 0;
  await page.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-2", email: "new-plan@example.com", role: "user", firstName: "New", lastName: "Plan" } }),
  }));
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    created += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ project: { id: projectId } }) });
  });
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() === "PUT") updated += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/#студия");
  await page.getByRole("button", { name: "Создание интерьера" }).click();
  await page.locator(".plan-template-grid").getByRole("button", { name: "Диван", exact: true }).click();
  await page.locator(".planogram-toolbar").getByRole("button", { name: "Сохранить проект" }).click();
  await expect(page.getByRole("dialog", { name: "Сохранить как проект" })).toBeVisible();
  await page.getByLabel("Название проекта").fill("Новая планировка");
  await page.getByRole("dialog", { name: "Сохранить как проект" }).getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => ({ created, updated })).toEqual({ created: 1, updated: 1 });
  await expect(page).toHaveURL(new RegExp(`\\?project=${projectId}#`));
});

test("planogram pouf, cabinet and shelving open their matching catalog categories", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440");
  const projectId = "planogram-catalog-types";
  const catalogTypes: string[] = [];
  await page.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-3", email: "catalog@example.com", role: "user", firstName: "Catalog", lastName: "User" } }),
  }));
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ project: { id: projectId, name: "Каталог планограммы", project_type: "Квартира" }, state: { planItems: [], planRoom: { width: 6000, length: 4500 } } }),
  }));
  await page.route("**/api/catalog?**", (route) => {
    catalogTypes.push(new URL(route.request().url()).searchParams.get("type") || "");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ products: [], total: 0, subtypes: [] }) });
  });

  await page.goto(`/?project=${projectId}#студия`);
  await page.getByRole("button", { name: "Создание интерьера" }).click();

  await page.locator(".plan-template-grid").getByRole("button", { name: "Пуф", exact: true }).click();
  await page.getByRole("button", { name: /Пуф: перемещать/ }).click({ button: "right" });
  await page.locator(".plan-context-menu").getByRole("button", { name: "Добавить из каталога" }).click();
  await expect.poll(() => catalogTypes.at(-1)).toBe("ottoman");
  await page.getByRole("button", { name: "Закрыть каталог" }).click();

  await page.locator(".plan-template-grid").getByRole("button", { name: "Шкаф", exact: true }).click();
  await page.getByRole("button", { name: /Шкаф: перемещать/ }).click({ button: "right" });
  const cabinetCatalog = page.locator(".plan-context-menu").getByRole("button", { name: "Добавить из каталога" });
  await expect(cabinetCatalog).toBeVisible();
  await cabinetCatalog.click();
  await expect.poll(() => catalogTypes.at(-1)).toBe("cabinet");
  await page.getByRole("button", { name: "Закрыть каталог" }).click();

  await page.locator(".plan-template-grid").getByRole("button", { name: "Стеллаж", exact: true }).click();
  await page.getByRole("button", { name: /Стеллаж: перемещать/ }).click({ button: "right" });
  await page.locator(".plan-context-menu").getByRole("button", { name: "Добавить из каталога" }).click();
  await expect.poll(() => catalogTypes.at(-1)).toBe("shelving");
});

test("planogram remembers an instruction without generating and sends it only with create render", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440");
  const projectId = "planogram-render-instruction";
  const instruction = "В комнате сидит чёрная кошка";
  let generationRequests = 0;
  let generationBody: { planRender?: { instruction?: string } } | null = null;
  let savedBody: { state?: { planInstruction?: string } } | null = null;

  await page.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-4", email: "instruction@example.com", role: "user", firstName: "Render", lastName: "Brief" } }),
  }));
  await page.route(`**/api/projects/${projectId}`, (route) => {
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON() as { state?: { planInstruction?: string } };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    const initialState = { planItems: [{ id: "sofa-1", kind: "sofa", name: "Диван", x: 20, y: 20, width: 2200, depth: 950, rotation: 0 }], planRoom: { width: 6000, length: 4500 } };
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: { id: projectId, name: "Инструкция рендера", project_type: "Квартира" },
        state: savedBody?.state || initialState,
      }),
    });
  });
  await page.route("**/api/generate", (route) => {
    generationRequests += 1;
    generationBody = route.request().postDataJSON() as { planRender?: { instruction?: string } };
    return route.fulfill({ status: 200, contentType: "image/png", body: imageBytes });
  });

  await page.goto(`/?project=${projectId}#студия`);
  await page.getByRole("button", { name: "Создание интерьера" }).click();
  await page.getByLabel("ЧТО ДОБАВИТЬ ИЛИ ИЗМЕНИТЬ?").fill(instruction);
  const remember = page.getByRole("button", { name: "Запомнить" });
  await remember.click();
  await expect(remember).toHaveAttribute("aria-pressed", "true");
  expect(generationRequests).toBe(0);

  await page.locator(".planogram-toolbar").getByRole("button", { name: "Сохранить проект" }).click();
  await expect.poll(() => savedBody?.state?.planInstruction).toBe(instruction);
  expect(generationRequests).toBe(0);

  await page.reload();
  await page.getByRole("button", { name: "Создание интерьера" }).click();
  await expect(page.getByLabel("ЧТО ДОБАВИТЬ ИЛИ ИЗМЕНИТЬ?")).toHaveValue(instruction);
  await expect(page.getByRole("button", { name: "Запомнить" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Создать рендер" }).click();
  await expect.poll(() => generationRequests).toBe(1);
  expect((generationBody as { planRender?: { instruction?: string } } | null)?.planRender?.instruction).toBe(instruction);
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
  await page.getByRole("dialog", { name: "Вход и регистрация" }).getByRole("button", { name: "Зарегистрироваться" }).click();
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
