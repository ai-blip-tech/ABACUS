import { getCabinetEuroRate } from '../../../lib/cabinet-euro-rate';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json(await getCabinetEuroRate(), { headers: { 'Cache-Control': 'no-store' } });
}
