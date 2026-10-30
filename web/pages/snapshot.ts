import { analyze } from '../lib/analysis/scoring';
import { demoIndex, demoStocks, DEMO_AS_OF } from '../lib/demo';
import type { MarketData } from '../lib/types';
import { marketWireSchema } from '../lib/wire-schema';

/** Deterministic public preview; never reads credentials, MySQL, or a provider. */
export function publicDemoSnapshot(): MarketData {
  const snapshot: MarketData = {
    mode: 'demo', fetchedAt: DEMO_AS_OF, snapshotAt: DEMO_AS_OF,
    provider: 'Illustrative public preview', refreshSeconds: 60,
    index: demoIndex(),
    stocks: demoStocks().map(stock => analyze(stock, new Date(DEMO_AS_OF)))
      .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1)),
    session: { status: 'CLOSED', phase: 'Illustrative snapshot', calendarVerified: false, timeZone: 'Asia/Jakarta' },
    warnings: [
      'Illustrative demo: prices, financials, foreign flows, headlines and research scores are simulated.',
      'Refresh reloads the published snapshot. Local MySQL prices are not connected to this public preview.',
    ],
    sources: [],
  };
  return marketWireSchema.parse(snapshot) as MarketData;
}
