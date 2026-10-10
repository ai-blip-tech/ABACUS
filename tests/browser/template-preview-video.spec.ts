import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("template videos advance on the homepage and template catalog", async ({ page }) => {
  for (const path of ["/#templates", "/templates"]) {
    await page.goto(path);
    await expect(page.locator(".template-status-label, .template-fixture-label, .home-template-triptych > small")).toHaveCount(0);
    for (const slug of ["design-battle", "light-scenarios"]) {
      const video = page.locator(`a[href="/templates/${slug}"] video`).first();
      await expect(video).toBeVisible();
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
      const start = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
      const before = await video.screenshot();
      await page.waitForTimeout(1_200);
      const end = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
      const after = await video.screenshot();
      const beforePixels = await sharp(before).removeAlpha().raw().toBuffer();
      const afterPixels = await sharp(after).removeAlpha().raw().toBuffer();
      let changed = 0;
      for (let index = 0; index < beforePixels.length; index += 1) {
        if (Math.abs(beforePixels[index] - afterPixels[index]) > 8) changed += 1;
      }
      const state = await video.evaluate((element: HTMLVideoElement) => ({ duration: element.duration, paused: element.paused, autoplay: element.autoplay }));
      const filter = await video.evaluate((element: HTMLVideoElement) => window.getComputedStyle(element).filter);
      expect(end).toBeGreaterThan(start + 0.25);
      expect(changed / beforePixels.length).toBeGreaterThan(0.01);
      expect(state.paused).toBe(false);
      expect(state.autoplay).toBe(true);
      expect(filter).toBe("none");
    }
  }
});
