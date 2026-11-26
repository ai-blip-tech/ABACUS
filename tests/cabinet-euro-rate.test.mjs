import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { cabinetRubles } from '../room-design-planner/cabinet-currency.ts';
import { cabinetRateWindow, getCabinetEuroRate, parseCabinetEuroRate, startCabinetEuroRateRefresh } from '../lib/cabinet-euro-rate.ts';

const payload = (date, value, nominal = '1') => `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="${date}"><Valute ID="R01235"><CharCode>USD</CharCode><Nominal>1</Nominal><Value>82,3130</Value></Valute>
<Valute ID="R01239"><CharCode>EUR</CharCode><Nominal>${nominal}</Nominal><Value>${value}</Value></Valute></ValCurs>`;

test('reads only the official EUR row, using its effective date and nominal', () => {
  assert.deepEqual(parseCabinetEuroRate(payload('26.11.2026', '902,3970', '10')), {
    effectiveDate: '2026-11-26', rublesPerEuro: 90.2397,
  });
  assert.throws(() => parseCabinetEuroRate(payload('26.11.2026', '90,2397', '0')));
  assert.throws(() => parseCabinetEuroRate(payload('26.11.2026', '90,2397').replace('EUR', 'GBP')));
});

test('refreshes at 17:00 Moscow time and applies the next official quote at midnight', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'roomdesign-cabinet-rate-'));
  const previousDirectory = process.env.ROOM_DESIGN_DATA_DIR;
  process.env.ROOM_DESIGN_DATA_DIR = directory;
  t.after(async () => {
    if (previousDirectory === undefined) delete process.env.ROOM_DESIGN_DATA_DIR;
    else process.env.ROOM_DESIGN_DATA_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  });
  const before = new Date('2026-11-26T13:59:55Z');
  assert.equal(cabinetRateWindow(before).slot, '2026-11-25');
  assert.equal(cabinetRateWindow(before).nextRefreshAt, Date.parse('2026-11-26T14:00:00Z'));
  assert.equal(cabinetRateWindow(new Date('2026-11-26T14:00:00Z')).slot, '2026-11-26');

  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: before });
  const requests = [];
  let offline = false;
  t.mock.method(globalThis, 'fetch', async url => {
    const day = url.searchParams.get('date_req');
    requests.push(day);
    if (offline) throw new Error('offline');
    const quotes = {
      '26/11/2026': ['26.11.2026', '90,2397'],
      '27/11/2026': ['27.11.2026', '89,8053'],
    };
    return new Response(payload(...quotes[day]));
  });

  startCabinetEuroRateRefresh();
  const first = await getCabinetEuroRate();
  assert.equal(first.quote.rublesPerEuro, 90.2397);
  assert.equal(requests.length, 2);

  t.mock.timers.tick(5000);
  for (let attempt = 0; requests.length < 4 && attempt < 10; attempt++) await setImmediate();
  assert.deepEqual(requests, ['26/11/2026', '27/11/2026', '26/11/2026', '27/11/2026']);
  assert.equal((await getCabinetEuroRate()).quote.rublesPerEuro, 90.2397);

  const persisted = JSON.parse(await readFile(join(directory, 'storage', 'cabinet-euro-rate.json'), 'utf8'));
  assert.equal(persisted.slot, '2026-11-26');

  t.mock.timers.setTime(Date.parse('2026-11-26T21:00:00Z'));
  assert.equal((await getCabinetEuroRate()).quote.rublesPerEuro, 89.8053);
  assert.equal(requests.length, 4);

  offline = true;
  t.mock.timers.setTime(Date.parse('2026-11-27T14:00:00Z'));
  const stale = await getCabinetEuroRate();
  assert.equal(stale.quote.rublesPerEuro, 89.8053);
  assert.equal(stale.stale, true);
  assert.equal(stale.nextCheckAt, Date.parse('2026-11-27T14:05:00Z'));
  await getCabinetEuroRate();
  assert.equal(requests.length, 6);
});


test('rounds the converted price once, directly to whole rubles', () => {
  const convert = (cents, rublesPerEuro) => cabinetRubles(cents, {
    quote: { effectiveDate: '2026-11-26', rublesPerEuro },
    stale: false,
    nextCheckAt: 0,
  }).replace(/\s/gu, ' ');
  assert.equal(convert(92400, 90.2397), '87 551 ₽');
  assert.equal(convert(100, 99.5238), '104 ₽');
  assert.equal(convert(100, 99.5239), '105 ₽');
});
