export const CABINET_ORDER_RECIPIENT = "info@roomdesign.com.ru";

export const cabinetOrderTopics = [
  "Итоговая стоимость",
  "Наличие и сроки",
  "Выбранные материалы и отделка",
  "Возможность изменить размеры",
  "Доставка и сборка",
  "Условия оплаты",
  "Гарантия",
] as const;

export type CabinetOrderProduct = {
  name: string;
  dimensions: string;
  finish: string;
  construction: string;
  price: string;
};

export function isCabinetOrderPhone(value: string) {
  const digits = value.replace(/\D/g, "").length;
  return /^[+\d\s().-]+$/.test(value) && digits >= 7 && digits <= 15;
}
