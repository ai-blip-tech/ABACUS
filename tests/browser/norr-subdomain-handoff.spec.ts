import { expect, test } from "@playwright/test";

const product = {
  id: "NRM00165",
  name: "Кресло NORR для теста",
  article: "NRM00165",
  image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%237b1020'/%3E%3C/svg%3E",
  images: [],
  url: "https://norrmobler.ru/product/nrm00165",
  price: 165750,
  oldPrice: 255000,
  available: true,
  category: "Кресла",
  subtype: "Кресло",
  color: "молочный",
  material: "ткань",
  widthMm: 900,
  depthMm: 850,
  heightMm: 1100,
  description: "Тестовый товар",
  parameters: [],
};

test("NORR product deep link opens the shared editor with a preselected product and no automatic generation", async ({ page }) => {
  let generationRequests = 0;
  await page.route("**/api/catalog?**", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [product], total: 1, page: 1, limit: 18, subtypes: [] }) }));
  await page.route("**/api/generate", async (route) => { generationRequests += 1; await route.abort(); });

  await page.goto("http://norr.localhost:3111/?norrProduct=NRM00165#%D1%81%D1%82%D1%83%D0%B4%D0%B8%D1%8F");

  await expect(page.getByRole("heading", { name: "Редактор изображений" })).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByRole("button", { name: /Создать интерьер/ })).toBeEnabled();
  await expect.poll(() => generationRequests).toBe(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("roomdesign:norr-product-handoff:v1") || "null")?.productId)).toBe(product.id);
});
