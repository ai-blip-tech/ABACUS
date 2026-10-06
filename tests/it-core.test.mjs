import assert from "node:assert/strict";
import test from "node:test";
import { runItTurn } from "../lib/it/core.ts";

const context = {
  route: "#студия",
  projectId: "project-1",
  projectName: "Гостиная",
  section: "image-editor",
  activeTool: "Добавить мебель",
  furnitureAction: "add",
  selectedObject: null,
  render: { hasSource: true, hasResult: false, isGenerating: false },
  planogram: { itemCount: 0, selectedItemId: null },
  availableActions: ["navigate_to", "focus_element", "highlight_element", "search_catalog"],
};

const product = {
  id: "chair-1",
  name: "Кресло Uno",
  image: "https://example.com/chair.jpg",
  url: "https://example.com/chair",
  price: 129_000,
  category: "Кресла",
  color: "Бежевый",
  material: "Шенилл",
  widthMm: 810,
  depthMm: 760,
  heightMm: 720,
};

test("It shows and highlights Replace for contextual product help", async () => {
  const turn = await runItTurn({ message: "Как заменить диван?", context }, { searchCatalog: async () => [] });
  assert.match(turn.text, /Заменить/);
  assert.deepEqual(turn.actions?.map((action) => action.type), ["navigate", "focus", "highlight"]);
});

test("It does not focus Replace before an interior is uploaded", async () => {
  const emptyContext = { ...context, render: { ...context.render, hasSource: false } };
  const turn = await runItTurn({ message: "Как заменить диван?", context: emptyContext }, { searchCatalog: async () => [] });
  assert.deepEqual(turn.actions, [{ type: "navigate", target: "image-editor" }]);
  assert.match(turn.text, /Сначала загрузите интерьер/);
});

test("It converts natural-language budget into a structured catalog search", async () => {
  let searchInput;
  const turn = await runItTurn(
    { message: "Найди кресло до 150 тысяч ₽", context },
    { searchCatalog: async (input) => { searchInput = input; return [product]; } },
  );
  assert.equal(searchInput.category, "armchair");
  assert.equal(searchInput.maxPrice, 150_000);
  assert.equal(turn.products?.[0].id, product.id);
  assert.match(turn.text, /Нашло 1 кресло/);
});

test("It gives a practical interior-design answer", async () => {
  const turn = await runItTurn(
    { message: "Какой материал дивана лучше для спокойного современного интерьера?", context },
    { searchCatalog: async () => [] },
  );
  assert.match(turn.text, /рогожк|шенилл/);
  assert.ok(turn.text.length < 500);
});

test("It delegates open-ended design questions to the knowledge adapter", async () => {
  let received;
  const turn = await runItTurn(
    { message: "Как смягчить слишком холодный интерьер?", context },
    {
      searchCatalog: async () => [],
      answerKnowledge: async (input) => { received = input; return "Добавьте тёплое дерево, фактурный текстиль и свет около 2700–3000 K."; },
    },
  );
  assert.equal(received.context.projectId, context.projectId);
  assert.match(turn.text, /тёплое дерево/);
});

test("It refuses out-of-scope requests briefly", async () => {
  const turn = await runItTurn({ message: "Какая завтра погода?", context }, { searchCatalog: async () => [] });
  assert.equal(turn.text, "Я специализируюсь на Room Design, интерьерах и архитектуре.");
  assert.equal(turn.products, undefined);
});
