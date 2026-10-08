export const PROPOSAL_BRAND = {
  domain: "NORRMOBLER.RU",
  contactDomain: "norrmobler.ru",
  officialName: "NORR MØBLER",
  coverAsset: "/proposal/cover-brand-official.svg",
  circleAsset: "/proposal/norr-circle.svg",
  aboutTitle: "О КОМПАНИИ",
  aboutLabel: "НАШ ПОДХОД",
  managerThanks: "СПАСИБО ЗА ВАШ ВЫБОР",
} as const;

export const PROPOSAL_SELECTION_MODULE = {
  pdf: {
    x: 44.5,
    y: 189,
    imageWidth: 376.5,
    panelWidth: 385,
    height: 300.5,
  },
  pptx: {
    x: 44.5 / 72,
    y: 105.78 / 72,
    imageWidth: 376.5 / 72,
    panelWidth: 385 / 72,
    height: 300.5 / 72,
  },
} as const;

export function isLegacyNorrBrand(value: string | undefined) {
  return /^NORR(?:\s|$)/i.test(String(value || "").trim());
}
