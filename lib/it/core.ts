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
  image?: string;
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
  return /найди|подбери|ищу|нужно? найти|самые дешевые|в каталоге|в наличии|покажи.{0,36}(?:вариант|подбор|товар|диван|кресл|стул|стол|кроват|ковер|светильник)/.test(text)
    || (hasPreviousProducts && /подешевле|дешевле|бюджетнее|другие варианты/.test(text))
    || (hasPriorSubject && /хочу другой|другой вариант|покажи другой/.test(text));
};

const planogramGuidanceTarget = (message: string, history: ItConversationMessage[], context: RoomDesignContext) => {
  const text = normalize(message);
  const recent = normalize(recentConversationText(history));
  const asksForPlanogram = /(?:как|где|что).{0,45}(?:попасть|перейти|открыть|нажать).{0,35}(?:план|создани[ея] интерьер)|планограмм/.test(text);
  const followsPlanPlacement = /^(?:на|в) план[.!?\s]*$/.test(text) && /добавить.{0,45}(?:диван|кресл)/.test(recent);
  const asksToAddOnPlan = context.section === "planogram" && /(?:как|где).{0,35}добавить.{0,45}(?:диван|кресл)/.test(text);
  if (!asksForPlanogram && !followsPlanPlacement && !asksToAddOnPlan) return undefined;
  if (context.section !== "planogram") return "planogram" as const;
  const subject = `${text} ${recent}`;
  if (/диван/.test(subject)) return "planogram-sofa" as const;
  if (/кресл/.test(subject)) return "planogram-armchair" as const;
  return "planogram" as const;
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

  const planogramTarget = planogramGuidanceTarget(message, history, request.context);
  if (planogramTarget) {
    actions.push({ type: "focus", target: planogramTarget }, { type: "highlight", target: planogramTarget }, { type: "guide", target: planogramTarget });
    toolFacts.push(planogramTarget === "planogram"
      ? "Нужно показать пользователю кнопку «Создание интерьера» в левой навигации. Оно физически подведёт сферу к этой кнопке; пользователь нажимает её самостоятельно."
      : `Планограмма уже открыта. Нужно показать кнопку «${planogramTarget === "planogram-sofa" ? "Диван" : "Кресло"}» в правой панели; пользователь нажимает её самостоятельно.`);
  }

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
      ? `Catalog search returned the ${products.length} cheapest real available matching products, sorted by price ascending across the complete filtered catalog result. Use only the attached structured product data for names, prices and properties.`
      : "Catalog search returned no matching products. Do not invent alternatives or prices.");
  }

  const text = await adapters.answerConversation({
    message,
    image: request.image,
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
