import type { ItCatalogProduct, ItRequest, ItTurn, RoomDesignContext } from "./types";

export type CatalogSearchInput = {
  query?: string;
  category?: string;
  maxPrice?: number;
  dimensions?: { widthMm?: number; depthMm?: number; heightMm?: number };
  material?: string;
  color?: string;
  style?: string;
  limit?: number;
};

export type ItAdapters = {
  searchCatalog(input: CatalogSearchInput): Promise<ItCatalogProduct[]>;
  answerKnowledge?(input: { message: string; context: RoomDesignContext }): Promise<string | null>;
};

const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();

const priceFromMessage = (message: string) => {
  const compact = normalize(message).replace(/\s/g, "");
  const match = compact.match(/(?:до|не дороже)(\d+(?:[.,]\d+)?)(тыс(?:яч)?|к|млн)?/);
  if (!match) return undefined;
  const value = Number(match[1].replace(",", "."));
  const multiplier = match[2]?.startsWith("млн") ? 1_000_000 : match[2] ? 1_000 : 1;
  return Number.isFinite(value) ? Math.round(value * multiplier) : undefined;
};

const categoryFromMessage = (message: string) => {
  const value = normalize(message);
  if (/кресл/.test(value)) return "armchair";
  if (/диван/.test(value)) return "sofa";
  if (/стул/.test(value)) return "chair";
  if (/стол/.test(value)) return "table";
  if (/кроват/.test(value)) return "bed";
  if (/ков[её]р/.test(value)) return "rug";
  if (/ламп|торшер|светильник|люстр/.test(value)) return "light";
  return undefined;
};

const russianCount = (count: number, one: string, few: string, many: string) => {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};

export async function runItTurn(request: ItRequest, adapters: ItAdapters): Promise<ItTurn> {
  const message = normalize(request.message);

  if (/погод|курс валют|биткоин|рецепт|футбол/.test(message)) {
    return { text: "Я специализируюсь на Room Design, интерьерах и архитектуре.", state: "speaking" };
  }

  const asksForReplaceHelp = /как\s+(?:мне\s+)?замен|покажи.{0,30}замен|где.{0,30}замен/.test(message)
    || (message.includes("что дальше") && request.context.furnitureAction === "replace");
  if (asksForReplaceHelp) {
    const hasSource = request.context.render.hasSource;
    return {
      text: hasSource
        ? "Покажу. Нажмите «Заменить», затем поставьте точку в центре дивана и выберите новый предмет из каталога или загрузите референс."
        : "Сначала загрузите интерьер. Затем откройте «Заменить», поставьте точку в центре дивана и выберите новый предмет.",
      state: "moving",
      actions: hasSource ? [
        { type: "navigate", target: "image-editor" },
        { type: "focus", target: "replace" },
        { type: "highlight", target: "replace" },
      ] : [{ type: "navigate", target: "image-editor" }],
    };
  }

  const category = categoryFromMessage(message);
  if (category && /найди|подбери|покажи|ищу|нуж/.test(message)) {
    const maxPrice = priceFromMessage(message);
    const products = await adapters.searchCatalog({ category, maxPrice, limit: 5 });
    if (!products.length) {
      return { text: "В каталоге не нашлось точных совпадений. Попробуйте расширить бюджет или уточнить материал и цвет.", state: "speaking" };
    }
    const budget = maxPrice ? ` до ${new Intl.NumberFormat("ru-RU").format(maxPrice)} ₽` : "";
    const resultWord = category === "armchair"
      ? russianCount(products.length, "кресло", "кресла", "кресел")
      : russianCount(products.length, "вариант", "варианта", "вариантов");
    return {
      text: `Нашло ${products.length} ${resultWord}${budget}. Сначала показываю позиции в наличии с самой спокойной палитрой.`,
      state: "success",
      products,
    };
  }

  if (adapters.answerKnowledge) {
    try {
      const answer = await adapters.answerKnowledge({ message: request.message.trim(), context: request.context });
      if (answer) return { text: answer, state: "speaking" };
    } catch {
      // Keep the core available when the language-model provider is unavailable.
    }
  }

  if (/материал|обивк|ткан/.test(message) && /диван|кресл|мебел/.test(message)) {
    return {
      text: "Для спокойного современного интерьера лучше взять плотную фактурную рогожку или мягкий шенилл в тёплом серо-бежевом тоне. Рогожка выглядит архитектурнее и практичнее, шенилл — мягче и глубже по цвету. Если диван используется каждый день, берите ткань от 40 000 циклов Мартиндейла.",
      state: "speaking",
    };
  }

  if (/цвет/.test(message) && /кресл|диван|мебел/.test(message)) {
    return {
      text: "Здесь подойдут тёплый табачный или глубокий оливковый. Первый поддержит дерево, второй даст спокойный контраст. Для точного выбора откройте нужный интерьер — я учту его контекст.",
      state: "speaking",
    };
  }

  return {
    text: request.context.section === "planogram"
      ? `Сейчас открыта планограмма, в ней ${request.context.planogram.itemCount} элементов. Могу помочь с расстановкой, размерами или подбором мебели.`
      : "Могу показать нужный инструмент, подобрать реальную мебель из каталога или помочь с цветом, материалом и композицией интерьера.",
    state: "speaking",
  };
}
