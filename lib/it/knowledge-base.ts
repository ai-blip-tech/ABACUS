import type { OnoTenantProfile } from "./tenant-profiles.ts";

export type OnoKnowledgeRecord = {
  id: string;
  scope: "global" | "roomdesign" | "norrmobler";
  title: string;
  content: string;
  source: string;
  sourceUrl?: string;
  confidence: "general_expertise" | "verified_product_ui" | "requires_manager_confirmation";
  version: string;
  updatedAt: string;
};

const records: readonly OnoKnowledgeRecord[] = [
  {
    id: "global-upholstery-selection",
    scope: "global",
    title: "Как выбирать обивку мягкой мебели",
    content: "Для выбора обивки уточняют интенсивность использования, наличие детей или животных, желаемую фактуру, требования к чистке и тактильные предпочтения. Износостойкость и состав нужно проверять по паспорту конкретной ткани; общая категория материала не подтверждает свойства конкретного варианта.",
    source: "Утверждённая экспертная памятка ОНО",
    confidence: "general_expertise",
    version: "1.0",
    updatedAt: "2026-10-11",
  },
  {
    id: "global-sofa-ergonomics",
    scope: "global",
    title: "Эргономика дивана и проверка габаритов",
    content: "Перед подбором дивана проверяют максимальную ширину и глубину, ширину дверных проёмов и маршрута заноса, свободные проходы, высоту и глубину посадки. Подходящая посадка зависит от роста, привычной позы и назначения; размеры конкретного артикула подтверждаются только каталогом.",
    source: "Утверждённая экспертная памятка ОНО",
    confidence: "general_expertise",
    version: "1.0",
    updatedAt: "2026-10-11",
  },
  {
    id: "global-material-care",
    scope: "global",
    title: "Уход за тканью кожей и столярными материалами",
    content: "Способ ухода зависит от точного состава и инструкции производителя. До подтверждения артикула допустимы только безопасные общие рекомендации: избегать непроверенной химии, сначала тестировать средство на незаметном участке и соблюдать паспорт изделия.",
    source: "Утверждённая экспертная памятка ОНО",
    confidence: "general_expertise",
    version: "1.0",
    updatedAt: "2026-10-11",
  },
  {
    id: "global-room-layout",
    scope: "global",
    title: "Планировка комнаты и безопасные проходы",
    content: "Подбор мебели начинают с масштаба помещения, дверей, окон, радиаторов и основных маршрутов движения. По одной фотографии нельзя достоверно определить размеры: пользователь должен подтвердить габариты комнаты и свободные проходы до выбора конкретного изделия.",
    source: "Утверждённая экспертная памятка ОНО",
    confidence: "general_expertise",
    version: "1.0",
    updatedAt: "2026-10-12",
  },
  {
    id: "global-lighting-layers",
    scope: "global",
    title: "Сценарии и слои освещения",
    content: "Интерьерное освещение обычно сочетает общий, рабочий и акцентный свет. Цветовая температура и яркость зависят от назначения зоны и времени использования; точную электрическую схему и совместимость оборудования должен подтверждать профильный специалист.",
    source: "Утверждённая экспертная памятка ОНО",
    confidence: "general_expertise",
    version: "1.0",
    updatedAt: "2026-10-12",
  },
  {
    id: "global-visual-search-boundary",
    scope: "global",
    title: "Ограничения визуального поиска",
    content: "По фотографии допустимо предположить тип предмета, доминирующие цвета, визуальную фактуру и стилистическое направление. Нельзя надёжно определить бренд, артикул, точный материал, размеры, цену или наличие. Спорные признаки нужно подтвердить у пользователя, а похожие товары показывать только из реального каталога.",
    source: "Политика Vision ОНО",
    confidence: "general_expertise",
    version: "1.0",
    updatedAt: "2026-10-12",
  },
  {
    id: "norr-commercial-terms",
    scope: "norrmobler",
    title: "Коммерческие условия NORR Møbler",
    content: "Скидки, резерв, фактическое наличие, сроки производства, доставка, сборка, гарантийные условия и доступные варианты персонализации требуют подтверждения живого менеджера. ОНО не должно обещать эти условия самостоятельно.",
    source: "Политика роли менеджера NORR Møbler",
    sourceUrl: "https://norrmobler.ru/contacts/",
    confidence: "requires_manager_confirmation",
    version: "1.0",
    updatedAt: "2026-10-11",
  },
  {
    id: "roomdesign-safe-actions",
    scope: "roomdesign",
    title: "Граница действий ОНО в Room Design",
    content: "ОНО объясняет точные шаги, подбирает товары и может подсветить зарегистрированный элемент интерфейса. Генерацию, сохранение, удаление, оплату и изменение проекта пользователь всегда запускает самостоятельно.",
    source: "Room Design product manifest",
    sourceUrl: "https://roomdesign.com.ru/templates",
    confidence: "verified_product_ui",
    version: "1.0",
    updatedAt: "2026-10-11",
  },
  {
    id: "roomdesign-image-input",
    scope: "roomdesign",
    title: "Изображение в диалоге с ОНО",
    content: "К сообщению можно прикрепить PNG, JPEG или WebP до 8 МБ. ОНО анализирует изображение для консультации и поиска, но не запускает генерацию и не изменяет проект. Результаты визуального анализа считаются предположениями, пока пользователь не подтвердит спорные параметры.",
    source: "Room Design widget contract",
    sourceUrl: "https://roomdesign.com.ru/templates",
    confidence: "verified_product_ui",
    version: "1.0",
    updatedAt: "2026-10-12",
  },
  {
    id: "norr-catalog-boundary",
    scope: "norrmobler",
    title: "Источник товарных характеристик NORR Møbler",
    content: "Цена, габариты, изображение, артикул, материал и ссылка конкретного товара используются только из подключённого каталога. Если поле отсутствует или фильтр не поддержан, ОНО сообщает об этом и не восполняет значение общими знаниями или интернет-поиском.",
    source: "NORR catalog adapter contract",
    sourceUrl: "https://norrmobler.ru/catalog/",
    confidence: "verified_product_ui",
    version: "1.0",
    updatedAt: "2026-10-12",
  },
];

const normalizedTokens = (value: string) => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").match(/[a-zа-я0-9]{3,}/gi) || [];
const tokenMatches = (left: string, right: string) => left === right || (left.length >= 5 && right.length >= 5 && (left.startsWith(right.slice(0, 5)) || right.startsWith(left.slice(0, 5))));

export function searchOnoKnowledge(profile: OnoTenantProfile, query: string, maxResults = 4) {
  const wantedScopes = new Set<OnoKnowledgeRecord["scope"]>(["global", profile.siteId]);
  const queryTokens = new Set(normalizedTokens(query));
  return records
    .filter((record) => wantedScopes.has(record.scope))
    .map((record) => {
      const haystack = normalizedTokens(`${record.title} ${record.content}`);
      const title = normalizedTokens(record.title);
      const score = [...queryTokens].reduce((total, token) => {
        const inTitle = title.some((candidate) => tokenMatches(token, candidate));
        const inContent = haystack.some((candidate) => tokenMatches(token, candidate));
        return total + (inTitle ? 3 : inContent ? 1 : 0);
      }, 0);
      return { record, score };
    })
    .filter(({ score }) => score > 0 || queryTokens.size === 0)
    .sort((left, right) => right.score - left.score || right.record.updatedAt.localeCompare(left.record.updatedAt))
    .slice(0, Math.min(6, Math.max(1, maxResults)))
    .map(({ record }) => record);
}

export function onoKnowledgeHealth(profile: OnoTenantProfile) {
  const scopes = new Set<OnoKnowledgeRecord["scope"]>(["global", profile.siteId]);
  const available = records.filter((record) => scopes.has(record.scope));
  return {
    version: onoKnowledgeVersion,
    records: available.length,
    scopes: [...scopes],
    missingSource: available.filter((record) => !record.source.trim()).length,
    missingVersion: available.filter((record) => !record.version.trim() || !record.updatedAt.trim()).length,
    requiresManagerConfirmation: available.filter((record) => record.confidence === "requires_manager_confirmation").length,
  };
}

export const onoKnowledgeVersion = "2026-10-12.1";
