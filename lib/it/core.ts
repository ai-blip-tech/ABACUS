import type {
  ItCatalogProduct,
  ItConversationMessage,
  ItRequest,
  ItTurn,
  ItUiAction,
  ItUiTarget,
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

const productGuidance = (message: string, history: ItConversationMessage[], context: RoomDesignContext): { target: ItUiTarget; fact: string } | undefined => {
  const text = normalize(message);
  const recent = normalize(recentConversationText(history));
  const selected = context.planogram.selectedItem;
  if (context.section === "planogram" && /референс.{0,24}пол|пол.{0,24}референс/.test(text)) {
    return { target: "planogram-floor-reference", fact: "Референс пола добавляется или заменяется кнопкой «Добавить референс пола» под планом." };
  }
  if (context.section === "planogram" && /референс.{0,24}стен|стен.{0,24}референс/.test(text)) {
    return { target: "planogram-wall-reference", fact: "Референс стен добавляется или заменяется кнопкой «Добавить референс стен» под планом." };
  }
  if (context.section === "planogram" && /(?:что|как).{0,36}(?:делает|работает|сохранить)|сохранить проект/.test(text) && /сохран/.test(text)) {
    return { target: "planogram-save", fact: "Кнопка «Сохранить проект» в верхней панели планограммы сохраняет план, предметы, референсы, камеру и дополнительную инструкцию в проекте аккаунта. Для сохранения нужен вход; у нового проекта интерфейс попросит название. JSON-файл не скачивается." };
  }
  if (context.section === "planogram" && selected) {
    if (/референс|изображен|картинк|фото|каталог|заменить.{0,24}(?:вид|модел|обивк)/.test(text)) {
      return {
        target: "planogram-selected-item",
        fact: `Сейчас выбрано «${selected.name}» ${selected.widthMm} × ${selected.depthMm} мм, поворот ${selected.rotation}°. Нажмите по предмету правой кнопкой: «Добавить из каталога» привяжет реальный товар с изображением, артикулом и габаритами, а «Загрузить референс» прикрепит собственное изображение. Скриншот для этого не нужен. Для точных размеров используются поля справа; двойной клик показывает восемь маркеров размера и вращение.`,
      };
    }
    if (/редакт|размер|ширин|глубин|габарит|поверн|удалить/.test(text)) {
      return {
        target: "planogram-properties",
        fact: `Сейчас выбрано «${selected.name}» ${selected.widthMm} × ${selected.depthMm} мм. Справа уже открыты его свойства: поля ширины и глубины, «Повернуть на 90°» и «Удалить предмет». Предмет перемещается перетаскиванием; двойной клик показывает восемь маркеров и вращение.`,
      };
    }
  }
  if (
    context.section === "planogram"
    && context.planogram.itemCount > 0
    && /референс|изображен|картинк|фото|каталог|редакт|размер|ширин|глубин|габарит|поверн|удалить|заменить/.test(text)
  ) {
    return {
      target: "planogram-selected-item",
      fact: "Предмет на плане сейчас не выделен. Сначала нажмите на него один раз — справа откроются поля ширины и глубины, поворот и удаление. Нажмите по предмету правой кнопкой: «Добавить из каталога» привяжет реальный товар, а «Загрузить референс» — собственное изображение; скриншот не нужен.",
    };
  }
  if (context.section === "planogram" && /(?:как|где|что).{0,36}(?:создать|сделать|запустить).{0,24}рендер|кнопк.{0,20}рендер/.test(text)) {
    return { target: "planogram-create-render", fact: `Кнопка «Создать рендер» находится под планом и доступна, когда на плане есть хотя бы один предмет. Сейчас предметов: ${context.planogram.itemCount}.` };
  }
  const asksForPlanogram = /(?:как|где|что).{0,45}(?:попасть|перейти|открыть|нажать).{0,35}(?:план|создани[ея] интерьер)|планограмм/.test(text);
  const followsPlanPlacement = /^(?:на|в) план[.!?\s]*$/.test(text) && /добавить.{0,45}(?:диван|кресл)/.test(recent);
  const asksToAddOnPlan = context.section === "planogram" && /(?:как|где).{0,35}добавить.{0,45}(?:диван|кресл)/.test(text);
  if (asksForPlanogram || followsPlanPlacement || asksToAddOnPlan) {
    if (context.section !== "planogram") return { target: "planogram", fact: "Нужно показать кнопку «Создание интерьера» в левой навигации; пользователь нажимает её самостоятельно." };
    const subject = `${text} ${recent}`;
    if (/диван/.test(subject)) return { target: "planogram-sofa", fact: "Планограмма уже открыта. Кнопка «Диван» находится в блоке «Добавить предмет» справа." };
    if (/кресл/.test(subject)) return { target: "planogram-armchair", fact: "Планограмма уже открыта. Кнопка «Кресло» находится в блоке «Добавить предмет» справа." };
    return { target: "planogram", fact: "Планограмма уже открыта в разделе «Создание интерьера»." };
  }
  if (/где.{0,30}(?:истори|рендер|верси)|прошлые.{0,20}рендер|скачать.{0,20}рендер|апскейл/.test(text)) return { target: "history", fact: `История рендеров находится под изображением и хранит до восьми версий. Сейчас версий: ${context.workspace.historyCount}.` };
  if (/коммерческ|предложени|powerpoint|pptx/.test(text)) {
    return {
      target: "save-project",
      fact: "Кнопка «Создать коммерческое предложение» находится над визуализацией рядом с сохранением проекта. Нужны вход, сохранённый проект и хотя бы один товар из каталога или предмет с референсом в текущей версии. Откроется отдельный редактор: там можно редактировать данные клиента, товары, цены и условия, включать или скрывать цены; изменения сохраняются автоматически. «Скачать PDF» выгружает PDF, а «Скачать PPT» — редактируемую презентацию PowerPoint в формате PPTX. Скриншот для этого не нужен.",
    };
  }
  if (/скачать|загрузить себе|сохранить.{0,24}(?:изображен|картинк|визуализац)/.test(text) && /изображен|картинк|визуализац|текущ/.test(text)) {
    return { target: "history", fact: "Кнопка скачивания над текущей визуализацией сохраняет её в JPEG. Любую отдельную версию можно скачать из истории рендеров — также в JPEG." };
  }
  if (/как.{0,24}сохран|где.{0,24}сохран/.test(text)) return { target: "save-project", fact: "Кнопка «Сохранить проект» в редакторе изображений сохраняет проект в аккаунте; для этого нужен вход." };
  if (context.section === "image-editor" && !context.render.hasSource && /загруз|добавить.{0,20}(?:фото|изображен|интерьер)/.test(text)) return { target: "image-upload", fact: "Своё изображение интерьера загружается через блок «Загрузите интерьер» в правой панели." };
  if (context.section === "image-editor" && /как.{0,32}добавить.{0,40}каталог|добавить.{0,24}(?:диван|кресл|мебел).{0,28}каталог/.test(text)) return { target: "editor-catalog", fact: "Для добавления из каталога нужно поставить точку на изображении, нажать «Добавить из каталога», выбрать товар и затем нажать «Создать интерьер»." };
  if (context.section === "image-editor" && /как.{0,32}удалить/.test(text)) return { target: "editor-remove", fact: "Для удаления нужно выбрать «Удалить» и поставить точку на предмете; изменяющее действие выполняет пользователь." };
  return undefined;
};

const shouldGuideReplace = (message: string, history: ItConversationMessage[], context: RoomDesignContext) => {
  const text = normalize(message);
  if (/как\s+(?:мне\s+)?замен|покажи.{0,30}замен|где.{0,30}замен/.test(text)) return true;
  if (!/^(покажи|да|давай|что дальше)[.!?\s]*$/.test(text)) return false;
  return context.furnitureAction === "replace" || /замен/.test(normalize(recentConversationText(history)));
};

const unavailableText = "Сейчас не могу сформировать ответ: модель временно недоступна. Попробуйте ещё раз.";
const IT_VISUAL_GUIDANCE_ENABLED = false;

export async function runItTurn(request: ItRequest, adapters: ItAdapters): Promise<ItTurn> {
  const history = (request.history || []).slice(-12);
  const message = request.message.trim();
  const normalizedMessage = normalize(message);
  const previousProducts = recentProducts(history);
  const actions: ItUiAction[] = [];
  const toolFacts: string[] = [];
  let products: ItCatalogProduct[] = [];

  const guidance = productGuidance(message, history, request.context);
  if (guidance) {
    if (IT_VISUAL_GUIDANCE_ENABLED) {
      actions.push({ type: "focus", target: guidance.target }, { type: "highlight", target: guidance.target }, { type: "guide", target: guidance.target });
    }
    toolFacts.push(`${guidance.fact} Объясни следующий шаг только текстом: не говори, что показываешь или подсвечиваешь элемент.`);
  }

  if (!guidance && shouldGuideReplace(message, history, request.context)) {
    const hasSource = request.context.render.hasSource;
    if (IT_VISUAL_GUIDANCE_ENABLED) {
      actions.push({ type: "navigate", target: "image-editor" });
      if (hasSource) actions.push({ type: "focus", target: "replace" }, { type: "highlight", target: "replace" });
    }
    if (hasSource) {
      toolFacts.push("Для замены предмета нужно открыть «Редактор изображений», нажать «Заменить» и поставить точку в центре предмета. Объясни это только текстом: не говори, что переходишь, показываешь или подсвечиваешь интерфейс.");
    } else {
      toolFacts.push("Интерьер ещё не загружен. Сначала нужно открыть «Редактор изображений» и загрузить изображение, затем нажать «Заменить» и поставить точку на предмете. Объясни это только текстом.");
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
