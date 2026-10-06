import type {
  ItCatalogProduct,
  ItConversationMessage,
  ItRequest,
  ItTurn,
  ItUiAction,
  RoomDesignContext,
} from "./types";

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

export type ConversationInput = {
  message: string;
  history: ItConversationMessage[];
  context: RoomDesignContext;
  products: ItCatalogProduct[];
  actions: ItUiAction[];
  toolFacts: string[];
};

export type ItAdapters = {
  searchCatalog(input: CatalogSearchInput): Promise<ItCatalogProduct[]>;
  answerConversation(input: ConversationInput): Promise<string | null>;
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

const categoryFromText = (value: string) => {
  const text = normalize(value);
  if (/кресл/.test(text)) return "armchair";
  if (/диван/.test(text)) return "sofa";
  if (/стул/.test(text)) return "chair";
  if (/стол/.test(text)) return "table";
  if (/кроват/.test(text)) return "bed";
  if (/ков[её]р/.test(text)) return "rug";
  if (/ламп|торшер|светильник|люстр/.test(text)) return "light";
  return undefined;
};

const recentProducts = (history: ItConversationMessage[]) => [...history]
  .reverse()
  .find((item) => item.products?.length)?.products || [];

const recentConversationText = (history: ItConversationMessage[], limit = 6) => history
  .slice(-limit)
  .map((item) => item.text)
  .join(" ");

const categoryFromProducts = (products: ItCatalogProduct[]) => categoryFromText(
  products.map((product) => `${product.category} ${product.name}`).join(" "),
);

const shouldSearchCatalog = (message: string, hasPreviousProducts: boolean, hasPriorSubject: boolean) => {
  const text = normalize(message);
  return /найди|подбери|покажи варианты|ищу|нужно? найти/.test(text)
    || (hasPreviousProducts && /подешевле|дешевле|бюджетнее|другие варианты/.test(text))
    || (hasPriorSubject && /хочу другой|другой вариант|покажи другой/.test(text));
};

const shouldGuideReplace = (message: string, history: ItConversationMessage[], context: RoomDesignContext) => {
  const text = normalize(message);
  if (/как\s+(?:мне\s+)?замен|покажи.{0,30}замен|где.{0,30}замен/.test(text)) return true;
  if (!/^(покажи|да|давай|что дальше)[.!?\s]*$/.test(text)) return false;
  return context.furnitureAction === "replace" || /замен/.test(normalize(recentConversationText(history)));
};

const unavailableText = "Сейчас не могу сформировать ответ: модель временно недоступна. Попробуйте ещё раз.";

export async function runItTurn(request: ItRequest, adapters: ItAdapters): Promise<ItTurn> {
  const history = (request.history || []).slice(-12);
  const message = request.message.trim();
  const normalizedMessage = normalize(message);
  const previousProducts = recentProducts(history);
  const actions: ItUiAction[] = [];
  const toolFacts: string[] = [];
  let products: ItCatalogProduct[] = [];

  if (shouldGuideReplace(message, history, request.context)) {
    const hasSource = request.context.render.hasSource;
    actions.push({ type: "navigate", target: "image-editor" });
    if (hasSource) {
      actions.push({ type: "focus", target: "replace" }, { type: "highlight", target: "replace" });
      toolFacts.push("Подготовлена навигация к Image Editor и подсветка кнопки «Заменить». После этого пользователь должен поставить точку на предмете.");
    } else {
      toolFacts.push("Интерьер ещё не загружен, поэтому Replace нельзя показать до загрузки изображения.");
    }
  }

  const explicitCategory = categoryFromText(message);
  const inheritedCategory = categoryFromProducts(previousProducts) || categoryFromText(recentConversationText(history));
  const category = explicitCategory || inheritedCategory;
  if (category && shouldSearchCatalog(message, previousProducts.length > 0, Boolean(inheritedCategory))) {
    let maxPrice = priceFromMessage(message);
    if (!maxPrice && previousProducts.length && /подешевле|дешевле|бюджетнее/.test(normalizedMessage)) {
      const priced = previousProducts.map((product) => product.price).filter((price) => price > 0);
      if (priced.length) maxPrice = Math.max(1, Math.min(...priced) - 1);
    }
    products = await adapters.searchCatalog({ category, maxPrice, limit: 5 });
    toolFacts.push(products.length
      ? `Catalog search returned ${products.length} real available products. Use only the attached structured product data for names, prices and properties.`
      : "Catalog search returned no matching products. Do not invent alternatives or prices.");
  }

  const text = await adapters.answerConversation({
    message,
    history,
    context: request.context,
    products,
    actions,
    toolFacts,
  }).catch(() => null);

  return {
    text: text || unavailableText,
    state: text ? products.length ? "success" : actions.length ? "moving" : "speaking" : "error",
    ...(products.length ? { products } : {}),
    ...(actions.length ? { actions } : {}),
  };
}
