import { expect, test } from "@playwright/test";

test("featured templates use independent columns without stretching compact cards", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/#templates");

    const grid = page.locator(".home-featured-grid");
    const battle = grid.locator('a[href="/templates/design-battle"]').first();
    const light = grid.locator('a[href="/templates/light-scenarios"]').first();
    const moodboard = grid.locator('a[href="/templates/moodboard-to-room"]').first();
    await expect(battle).toBeVisible();
    await expect(light).toBeVisible();
    await expect(moodboard).toBeVisible();
    await expect(grid.locator(".home-featured-column")).toHaveCount(2);

    const battleBox = await battle.boundingBox();
    const lightBox = await light.boundingBox();
    const moodboardBox = await moodboard.boundingBox();
    const battleMediaBox = await battle.locator(".home-template-triptych").boundingBox();
    const lightMediaBox = await light.locator(".home-template-triptych").boundingBox();
    const battleLinkBox = await battle.locator(".home-template-card-copy > b").boundingBox();
    const lightLinkBox = await light.locator(".home-template-card-copy > b").boundingBox();
    expect(battleBox && lightBox && moodboardBox && battleMediaBox && lightMediaBox && battleLinkBox && lightLinkBox).toBeTruthy();
    if (!battleBox || !lightBox || !moodboardBox || !battleMediaBox || !lightMediaBox || !battleLinkBox || !lightLinkBox) continue;

    expect(lightBox.height).toBeLessThan(battleBox.height);
    expect(lightMediaBox.height).toBeLessThan(battleMediaBox.height);
    expect(Math.abs(moodboardBox.y - (lightBox.y + lightBox.height) - 12)).toBeLessThanOrEqual(1);
    const battleBottomPadding = battleBox.y + battleBox.height - (battleLinkBox.y + battleLinkBox.height);
    const lightBottomPadding = lightBox.y + lightBox.height - (lightLinkBox.y + lightLinkBox.height);
    expect(Math.abs(battleBottomPadding - lightBottomPadding)).toBeLessThanOrEqual(1);
  }
});

test("featured templates preserve source order in one mobile column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#templates");
  const grid = page.locator(".home-featured-grid");
  await expect(grid.locator(".home-featured-column")).toHaveCount(1);
  const hrefs = await grid.locator(".home-template-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("href")));
  expect(hrefs.slice(0, 4)).toEqual([
    "/templates/design-battle",
    "/templates/light-scenarios",
    "/templates/next-chapter",
    "/templates/moodboard-to-room",
  ]);
});
