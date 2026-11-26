import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

type Quote = { effectiveDate: string; rublesPerEuro: number };
type Snapshot = { slot: string; through: string; quotes: Quote[] };
type RateState = {
  snapshot?: Snapshot;
  initialization?: Promise<void>;
  refresh?: Promise<void>;
  retryAt: number;
  started: boolean;
};

const processScope = globalThis as typeof globalThis & { roomDesignCabinetEuroRate?: RateState };
const state = (processScope.roomDesignCabinetEuroRate ??= { retryAt: 0, started: false });
const dayLength = 24 * 60 * 60_000;
const retryDelay = 5 * 60_000;
const moscowCalendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day: string, days: number) => new Date(Date.parse(day) + days * dayLength).toISOString().slice(0, 10);
const cachePath = () => resolve(process.env.ROOM_DESIGN_DATA_DIR || process.env.DATA_DIR || 'data', 'storage', 'cabinet-euro-rate.json');

export function cabinetRateWindow(now: Date) {
  const today = moscowCalendar.format(now);
  const tomorrow = addDays(today, 1);
  const cutoff = Date.parse(today + 'T17:00:00+03:00');
  const pastCutoff = now.getTime() >= cutoff;
  return {
    today,
    tomorrow,
    slot: pastCutoff ? today : addDays(today, -1),
    nextRefreshAt: cutoff + (pastCutoff ? dayLength : 0),
    midnight: Date.parse(tomorrow + 'T00:00:00+03:00'),
  };
}

function validQuote(quote: Quote) {
  return datePattern.test(quote.effectiveDate) && Number.isFinite(quote.rublesPerEuro) && quote.rublesPerEuro > 0;
}

export function parseCabinetEuroRate(xml: string): Quote {
  const [, day, month, year] = /<ValCurs\b[^>]*\bDate="(\d{2})\.(\d{2})\.(\d{4})"/i.exec(xml) ?? [];
  const row = xml.match(/<Valute\b[^>]*>[\s\S]*?<\/Valute>/g)?.find(entry => /<CharCode>\s*EUR\s*<\/CharCode>/.test(entry));
  const value = Number(/<Value>\s*([\d,]+)\s*<\/Value>/.exec(row ?? '')?.[1].replace(',', '.'));
  const nominal = Number(/<Nominal>\s*(\d+)\s*<\/Nominal>/.exec(row ?? '')?.[1]);
  const quote = { effectiveDate: [year, month, day].join('-'), rublesPerEuro: value / nominal };
  if (!validQuote(quote) || !Number.isInteger(nominal) || nominal < 1) throw new Error('Некорректный курс евро Банка России');
  return quote;
}

async function fetchQuote(day: string): Promise<Quote> {
  const url = new URL('https://www.cbr.ru/scripts/XML_daily.asp');
  url.searchParams.set('date_req', day.split('-').reverse().join('/'));
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Выгрузка Банка России недоступна');
  // The XML uses Windows-1251. Currency codes, dates and numbers are ASCII.
  const quote = parseCabinetEuroRate(new TextDecoder('windows-1251').decode(await response.arrayBuffer()));
  if (quote.effectiveDate > day) throw new Error('Получен курс за будущую дату');
  return quote;
}

async function loadSnapshot() {
  try {
    const data = JSON.parse(await readFile(cachePath(), 'utf8')) as Snapshot;
    if (datePattern.test(data.slot) && datePattern.test(data.through) && data.quotes.length && data.quotes.every(validQuote)) state.snapshot = data;
  } catch {
    // A missing or invalid file is replaced after a successful refresh.
  }
}

async function saveSnapshot(snapshot: Snapshot) {
  const file = cachePath();
  const temporary = file + '.' + randomUUID();
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(snapshot));
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function refreshIfDue() {
  await (state.initialization ??= loadSnapshot());
  if (state.refresh) return state.refresh;
  const now = new Date();
  const { today, tomorrow, slot } = cabinetRateWindow(now);
  if (state.snapshot?.slot === slot && state.snapshot.through >= today) return;
  if (state.retryAt > now.getTime()) return;
  state.refresh = (async () => {
    try {
      const [current, next] = await Promise.all([fetchQuote(today), fetchQuote(tomorrow)]);
      const quotes = current.effectiveDate === next.effectiveDate ? [next] : [current, next];
      const snapshot = { slot, through: tomorrow, quotes };
      state.snapshot = snapshot;
      state.retryAt = 0;
      await saveSnapshot(snapshot).catch(() => console.warn('Не удалось сохранить курс евро Room Design на диске'));
    } catch {
      state.retryAt = Date.now() + retryDelay;
    } finally {
      state.refresh = undefined;
    }
  })();
  return state.refresh;
}

export function startCabinetEuroRateRefresh() {
  if (state.started) return;
  state.started = true;
  async function run() {
    await refreshIfDue();
    const now = Date.now();
    const { nextRefreshAt } = cabinetRateWindow(new Date(now));
    const nextAttempt = Math.min(nextRefreshAt, state.retryAt > now ? state.retryAt : Infinity);
    setTimeout(() => void run(), Math.max(1000, nextAttempt - now)).unref();
  }
  void run();
}

export async function getCabinetEuroRate() {
  await refreshIfDue();
  const now = Date.now();
  const { today, slot, nextRefreshAt, midnight } = cabinetRateWindow(new Date(now));
  const snapshot = state.snapshot;
  const quote = snapshot?.quotes.findLast(item => item.effectiveDate <= today) ?? null;
  return {
    quote,
    stale: !!quote && (snapshot!.through < today || (state.retryAt > now && snapshot!.slot !== slot)),
    nextCheckAt: Math.min(nextRefreshAt, midnight, state.retryAt > now ? state.retryAt : Infinity),
  };
}
