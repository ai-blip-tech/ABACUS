export const BUSINESS_TIME_ZONE = process.env.ROOM_DESIGN_BUSINESS_TIMEZONE || "Europe/Moscow";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: string) {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateOnlyInTimeZone(date: Date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nextDateOnly(value: string) {
  if (!isDateOnly(value)) throw new Error("Некорректная дата.");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function zonedStartOfDayUtc(value: string, timeZone = BUSINESS_TIME_ZONE) {
  if (!isDateOnly(value)) throw new Error("Некорректная дата.");
  const [year, month, day] = value.split("-").map(Number);
  const intendedUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = intendedUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    guess += intendedUtc - representedUtc;
  }
  return new Date(guess).toISOString();
}

export function dateRangeUtc(fromDate: string, toDate: string, timeZone = BUSINESS_TIME_ZONE) {
  if (!isDateOnly(fromDate) || !isDateOnly(toDate) || fromDate > toDate) {
    throw new Error("Проверьте даты периода: дата начала должна быть не позже даты окончания.");
  }
  return {
    from: zonedStartOfDayUtc(fromDate, timeZone),
    toExclusive: zonedStartOfDayUtc(nextDateOnly(toDate), timeZone),
  };
}

export function defaultMonthRange(now = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const toDate = dateOnlyInTimeZone(now, timeZone);
  return { fromDate: `${toDate.slice(0, 7)}-01`, toDate };
}
