import { useEffect, useState } from 'react';

export type CabinetEuroRate = {
  quote: { effectiveDate: string; rublesPerEuro: number } | null;
  stale: boolean;
  nextCheckAt: number;
};

export const cabinetEuro = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' });
const cabinetRuble = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const officialRate = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export function cabinetEuroCents(price: string, storedCents?: number) {
  if (storedCents !== undefined && Number.isSafeInteger(storedCents) && storedCents >= 0) return storedCents;
  const match = /^(\d+)(?:,(\d{2}))?€$/u.exec(price.replace(/\s/gu, ''));
  if (!match) return undefined;
  const cents = Number(match[1] + (match[2] ?? '00'));
  return Number.isSafeInteger(cents) ? cents : undefined;
}

export function cabinetRubles(cents: number | undefined, rate: CabinetEuroRate | null) {
  if (cents === undefined || !rate?.quote) return undefined;
  const rateToFourDecimals = BigInt(Math.round(rate.quote.rublesPerEuro * 10_000));
  const rubleDivisor = 100n * 10_000n * 100n;
  const rubles = (BigInt(cents) * rateToFourDecimals * 105n + rubleDivisor / 2n) / rubleDivisor;
  return cabinetRuble.format(rubles);
}

export function cabinetRateLabel(rate: CabinetEuroRate | null) {
  if (!rate?.quote) return 'Курс ЦБ недоступен';
  const { effectiveDate, rublesPerEuro } = rate.quote;
  const label = 'ЦБ ' + officialRate.format(rublesPerEuro) + ' ₽/€ + 5% · ' + effectiveDate.split('-').reverse().join('.');
  return rate.stale ? 'Последний сохранённый курс · ' + label : label;
}

export async function fetchCabinetEuroRate(): Promise<CabinetEuroRate> {
  const response = await fetch('/api/cabinet-euro-rate', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('Курс Банка России недоступен');
  return response.json();
}

export function useCabinetEuroRate(active: boolean) {
  const [rate, setRate] = useState<CabinetEuroRate | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let loading = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (loading) return;
      loading = true;
      clearTimeout(timer);
      let nextCheckAt = Date.now() + 5 * 60_000;
      try {
        const current = await fetchCabinetEuroRate();
        nextCheckAt = current.nextCheckAt;
        if (!stopped) setRate(current);
      } catch {
        if (!stopped) setRate(previous => previous ? { ...previous, stale: true } : { quote: null, stale: false, nextCheckAt });
      } finally {
        loading = false;
        if (!stopped) timer = setTimeout(refresh, Math.max(1000, nextCheckAt - Date.now()));
      }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [active]);
  return rate;
}
