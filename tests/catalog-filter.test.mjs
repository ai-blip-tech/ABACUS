import assert from "node:assert/strict";
import test from "node:test";

import { matchesCatalogType } from "../lib/catalog-filter.ts";

const product = (overrides = {}) => ({
  name: "",
  category: "Столы",
  subtype: "",
  ...overrides,
});

test("каталог журнальных столов не принимает приставную сантехнику", () => {
  assert.equal(matchesCatalogType(product({
    name: "Унитаз приставной безободковый с сидением-микролифт",
    category: "Унитазы",
    subtype: "безободковый с сидением микролифт",
  }), "coffee_table", "Сантехника / Унитазы"), false);

  assert.equal(matchesCatalogType(product({
    name: "Биде приставное",
    category: "Биде",
    subtype: "приставное",
  }), "coffee_table", "Сантехника / Биде"), false);
});

test("каталог сохраняет журнальные и приставные столы", () => {
  assert.equal(matchesCatalogType(product({
    name: "Стол журнальный RONDA",
    subtype: "Стол журнальный",
  }), "coffee_table", "Мебель / Столы"), true);

  assert.equal(matchesCatalogType(product({
    name: "Стол приставной GIO",
    subtype: "Стол приставной",
  }), "coffee_table", "Мебель / Столы"), true);
});

test("новые категории текущей версии сохраняют свою фильтрацию", () => {
  assert.equal(matchesCatalogType(product({ name: "Пуф Juno", category: "Пуфы" }), "ottoman", "Мебель / Пуфы"), true);
  assert.equal(matchesCatalogType(product({ name: "Стеллаж Line", category: "Стеллажи" }), "shelving", "Мебель / Стеллажи"), true);
});
