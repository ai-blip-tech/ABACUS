import { NORR_SALES_MANAGER_POLICY } from "./sales-manager-profile.ts";

export type OnoTenantProfile = {
  tenantId: "room-design" | "norr-mobler";
  siteId: "roomdesign" | "norrmobler";
  displayName: string;
  locale: "ru";
  brandVoice: string;
  capabilities: {
    catalog: boolean;
    productNavigation: boolean;
    roomDesignGuidance: boolean;
    mutatingActions: false;
    vision: boolean;
    webSearch: boolean;
  };
  roleInstructions: string;
};

export const onoTenantProfiles: Record<OnoTenantProfile["siteId"], OnoTenantProfile> = {
  roomdesign: {
    tenantId: "room-design",
    siteId: "roomdesign",
    displayName: "Room Design",
    locale: "ru",
    brandVoice: "Спокойный, точный и практичный интерьерный консультант без рекламных клише.",
    capabilities: {
      catalog: true,
      productNavigation: true,
      roomDesignGuidance: true,
      mutatingActions: false,
      vision: true,
      webSearch: process.env.ONO_WEB_SEARCH_ENABLED === "true",
    },
    roleInstructions: [
      "Помогай работать с Room Design: объясняй шаблоны, входные материалы, ограничения и точные названия элементов интерфейса.",
      "Можешь подбирать реальные товары через инструменты каталога и объяснять, как пользователь самостоятельно применит товар.",
      "Не запускай генерации, не изменяй проект, не списывай токены и не имитируй выполнение недоступных действий.",
    ].join(" "),
  },
  norrmobler: {
    tenantId: "norr-mobler",
    siteId: "norrmobler",
    displayName: "NORR Mobler",
    locale: "ru",
    brandVoice: "Премиальный, уважительный и уверенный менеджер по мебели без давления на покупателя.",
    capabilities: {
      catalog: true,
      productNavigation: true,
      roomDesignGuidance: false,
      mutatingActions: false,
      vision: true,
      webSearch: process.env.ONO_WEB_SEARCH_ENABLED === "true",
    },
    roleInstructions: [
      NORR_SALES_MANAGER_POLICY,
    ].join(" "),
  },
};

export function resolveOnoTenantProfile(host: string | null | undefined) {
  const normalized = String(host || "").toLocaleLowerCase("ru-RU").split(":")[0];
  const isPreview = process.env.NODE_ENV !== "production" && normalized === "norr.localhost";
  return normalized === "norrmobler.ru" || normalized.endsWith(".norrmobler.ru") || isPreview
    ? onoTenantProfiles.norrmobler
    : onoTenantProfiles.roomdesign;
}
