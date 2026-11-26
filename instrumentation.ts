export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCabinetEuroRateRefresh } = await import('./lib/cabinet-euro-rate');
    startCabinetEuroRateRefresh();
  }
}
