import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import {
  calculateChainScore,
  calculateTripScore,
  classifyMarket,
  generateMarketInsight,
  handler,
  isTowardDestination,
  LoadChain,
  LoadWithScore,
  normalize,
  searchCorridorChains,
  searchDirectLoads,
} from '../lambda/corridor-search';
import { calculateDistance } from '../lambda/shared/utils';
import { apiEvent, CITIES, loc, makeDriver, makeLoad, parseResponse } from './helpers/fixtures';

const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

function scored(load = makeLoad(), deadheadMiles = 0): LoadWithScore {
  return {
    load,
    deadheadMiles,
    tripScore: calculateTripScore(load, deadheadMiles),
    revenuePerMile: load.postedRate,
    marketComparison: classifyMarket(load),
  };
}

function chainOf(legs: LoadWithScore[], extra: Partial<LoadChain> = {}): LoadChain {
  const totalRevenue = legs.reduce((s, l) => s + l.load.postedRate * l.load.distanceMiles, 0);
  const totalDeadhead = legs.reduce((s, l) => s + l.deadheadMiles, 0);
  const totalMiles = legs.reduce((s, l) => s + l.load.distanceMiles, 0) + totalDeadhead;
  return {
    chainId: 'CHAIN-test',
    legs,
    chainScore: 0,
    totalRevenue,
    totalMiles,
    totalDeadhead,
    revenuePerMile: totalRevenue / totalMiles,
    summary: 'test',
    ...extra,
  };
}

describe('normalize', () => {
  it('maps the range linearly onto 0-10', () => {
    expect(normalize(1.5, 1.5, 3.5)).toBe(0);
    expect(normalize(2.5, 1.5, 3.5)).toBe(5);
    expect(normalize(3.5, 1.5, 3.5)).toBe(10);
  });

  it('clamps values outside the range', () => {
    expect(normalize(0.5, 1.5, 3.5)).toBe(0);
    expect(normalize(9, 1.5, 3.5)).toBe(10);
  });
});

describe('calculateTripScore (rate 50% / deadhead 30% / market 20%)', () => {
  it('scores an at-market $2.50/mi load with no deadhead at 6.5', () => {
    // rate 5 * 0.5 + deadhead 10 * 0.3 + market 5 * 0.2
    expect(calculateTripScore(makeLoad({ postedRate: 2.5, marketRateAvg: 2.5 }), 0)).toBeCloseTo(6.5);
  });

  it('gives a perfect 10 to a top-rate, above-market load at the driver location', () => {
    expect(calculateTripScore(makeLoad({ postedRate: 3.5, marketRateAvg: 2.8 }), 0)).toBeCloseTo(10);
  });

  it('loses 0.15 points per 10 deadhead miles', () => {
    const load = makeLoad();
    expect(calculateTripScore(load, 0) - calculateTripScore(load, 100)).toBeCloseTo(1.5);
  });

  it('never lets the deadhead component go negative (200+ miles floors at 0)', () => {
    const load = makeLoad();
    expect(calculateTripScore(load, 200)).toBeCloseTo(calculateTripScore(load, 5000));
    expect(calculateTripScore(load, 200)).toBeCloseTo(3.5);
  });

  it('ranks a better-paying load above a cheaper one at equal deadhead', () => {
    const rich = makeLoad({ postedRate: 3.0, marketRateAvg: 2.5 });
    const poor = makeLoad({ postedRate: 2.0, marketRateAvg: 2.5 });
    expect(calculateTripScore(rich, 50)).toBeGreaterThan(calculateTripScore(poor, 50));
  });
});

describe('classifyMarket', () => {
  it.each([
    [2.7, 2.5, 'above'],
    [2.6, 2.5, 'at'], // +4% is within the 5% band
    [2.4, 2.5, 'at'],
    [2.3, 2.5, 'below'],
  ])('posted %p vs market %p is %p', (posted, market, expected) => {
    expect(classifyMarket(makeLoad({ postedRate: posted, marketRateAvg: market }))).toBe(expected);
  });
});

describe('calculateChainScore', () => {
  it('rewards revenue per mile and market rate, and penalises deadhead', () => {
    const leg = scored(makeLoad({ postedRate: 2.0, marketRateAvg: 2.0, distanceMiles: 1000 }), 0);
    // rpm 2.0 * 0.6 + market 5 * 0.2 - 0 = 2.2 -> normalize(2.2, 1.5, 3.0)
    expect(calculateChainScore(chainOf([leg]))).toBeCloseTo((0.7 / 1.5) * 10);
  });

  it('drops to 0 once deadhead overwhelms the revenue', () => {
    const leg = scored(makeLoad({ postedRate: 2.0, marketRateAvg: 2.0, distanceMiles: 1000 }), 0);
    expect(calculateChainScore(chainOf([leg], { totalDeadhead: 50 }))).toBe(0);
  });

  it('averages the market score across legs', () => {
    const above = scored(makeLoad({ postedRate: 2.4, marketRateAvg: 2.0, distanceMiles: 500 }));
    const below = scored(makeLoad({ postedRate: 1.6, marketRateAvg: 2.0, distanceMiles: 500 }));
    const mixed = chainOf([above, below]);
    const flat = chainOf([
      scored(makeLoad({ postedRate: 2.0, marketRateAvg: 2.0, distanceMiles: 500 })),
      scored(makeLoad({ postedRate: 2.0, marketRateAvg: 2.0, distanceMiles: 500 })),
    ]);
    // Same total revenue and miles, and (10 + 0) / 2 == (5 + 5) / 2 for the market term.
    expect(calculateChainScore(mixed)).toBeCloseTo(calculateChainScore(flat));
  });
});

describe('isTowardDestination', () => {
  it('accepts a leg that cuts the remaining distance by more than 20%', () => {
    expect(isTowardDestination(CITIES.dallas, CITIES.memphis, CITIES.atlanta)).toBe(true);
    expect(isTowardDestination(CITIES.memphis, CITIES.atlanta, CITIES.atlanta)).toBe(true);
  });

  it('rejects a leg heading away from the destination', () => {
    expect(isTowardDestination(CITIES.atlanta, CITIES.dallas, CITIES.atlanta)).toBe(false);
    expect(isTowardDestination(CITIES.dallas, CITIES.denver, CITIES.atlanta)).toBe(false);
  });

  it('rejects a leg that only makes a little progress', () => {
    const slightlyCloser = { city: 'X', state: 'TX', lat: 32.7767, lng: -95.5 }; // ~75 mi east of Dallas
    expect(isTowardDestination(CITIES.dallas, slightlyCloser, CITIES.atlanta)).toBe(false);
  });
});

describe('generateMarketInsight', () => {
  const direct = scored(makeLoad({ loadId: 'D', postedRate: 2.5, distanceMiles: 800 })); // $2,000

  it('reports no options when nothing matched', () => {
    expect(generateMarketInsight([], [])).toMatchObject({ bestOption: 'none', loadCount: 0, avgMarketRate: 0 });
  });

  it('recommends the direct load when there is no chain', () => {
    const insight = generateMarketInsight([direct], []);
    expect(insight.bestOption).toBe('direct');
    expect(insight.recommendation).toContain('$2.50/mile');
  });

  it('recommends the chain when there is no direct load', () => {
    const chain = chainOf([direct]);
    expect(generateMarketInsight([], [chain]).bestOption).toBe('chain');
  });

  it('recommends a chain that pays more than $50 over the best direct load', () => {
    const chain = chainOf([direct], { totalRevenue: 2100 });
    const insight = generateMarketInsight([direct], [chain]);
    expect(insight.bestOption).toBe('chain');
    expect(insight.savingsVsDirect).toBeCloseTo(100);
  });

  it('recommends direct when it beats the chain by more than $50', () => {
    const chain = chainOf([direct], { totalRevenue: 1900 });
    expect(generateMarketInsight([direct], [chain])).toMatchObject({ bestOption: 'direct', savingsVsDirect: -100 });
  });

  it('prefers the simpler direct load when the difference is within $50', () => {
    const chain = chainOf([direct], { totalRevenue: 2040 });
    const insight = generateMarketInsight([direct], [chain]);
    expect(insight.bestOption).toBe('direct');
    expect(insight.recommendation).toContain('similar');
  });

  it('averages the market rate over every load considered', () => {
    const a = scored(makeLoad({ marketRateAvg: 2.0 }));
    const b = scored(makeLoad({ marketRateAvg: 3.0 }));
    const insight = generateMarketInsight([a], [chainOf([b])]);
    expect(insight.loadCount).toBe(2);
    expect(insight.avgMarketRate).toBeCloseTo(2.5);
  });
});

// --- Search functions against a mocked DynamoDB table ---------------------------------

const directDallasAtlanta = makeLoad({ loadId: 'DIRECT', postedRate: 1.8, marketRateAvg: 2.4, distanceMiles: 780 });
const dallasMemphis = makeLoad({
  loadId: 'LEG1', origin: loc('dallas'), destination: loc('memphis'), distanceMiles: 450, postedRate: 3.0, marketRateAvg: 2.6,
});
const memphisAtlanta = makeLoad({
  loadId: 'LEG2', origin: loc('memphis'), destination: loc('atlanta'), distanceMiles: 390, postedRate: 3.2, marketRateAvg: 2.7,
});
const awayToDenver = makeLoad({ loadId: 'AWAY', destination: loc('denver'), distanceMiles: 800, postedRate: 3.5 });
const reefer = makeLoad({ loadId: 'REEFER', equipment: 'Reefer', postedRate: 3.4, marketRateAvg: 2.8 });

describe('searchDirectLoads', () => {
  it('only returns loads whose pickup and drop are within 75 miles of the requested lane, best first', async () => {
    const better = makeLoad({ loadId: 'BETTER', postedRate: 3.0 });
    ddb.on(ScanCommand).resolves({ Items: [directDallasAtlanta, dallasMemphis, better, awayToDenver] });

    const results = await searchDirectLoads(CITIES.dallas, CITIES.atlanta, CITIES.dallas);

    expect(results.map(r => r.load.loadId)).toEqual(['BETTER', 'DIRECT']);
    expect(results[0].tripScore).toBeGreaterThan(results[1].tripScore);
    expect(results[1].marketComparison).toBe('below');
  });

  it('applies equipment and minimum-rate filters', async () => {
    ddb.on(ScanCommand).resolves({ Items: [directDallasAtlanta, reefer] });

    expect((await searchDirectLoads(CITIES.dallas, CITIES.atlanta, CITIES.dallas, 'Reefer')).map(r => r.load.loadId))
      .toEqual(['REEFER']);
    expect((await searchDirectLoads(CITIES.dallas, CITIES.atlanta, CITIES.dallas, undefined, 2.0)).map(r => r.load.loadId))
      .toEqual(['REEFER']);
  });

  it('measures deadhead from the driver location to the pickup', async () => {
    ddb.on(ScanCommand).resolves({ Items: [directDallasAtlanta] });
    const [result] = await searchDirectLoads(CITIES.dallas, CITIES.atlanta, CITIES.memphis);
    expect(result.deadheadMiles).toBe(calculateDistance(CITIES.memphis.lat, CITIES.memphis.lng, CITIES.dallas.lat, CITIES.dallas.lng));
  });

  it('only scans for available loads', async () => {
    ddb.on(ScanCommand).resolves({ Items: [] });
    await searchDirectLoads(CITIES.dallas, CITIES.atlanta, CITIES.dallas);
    const input = ddb.commandCalls(ScanCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues).toEqual({ ':status': 'available' });
  });
});

describe('searchCorridorChains', () => {
  it('builds a two-leg chain through a relay city and totals revenue, miles and deadhead', async () => {
    ddb.on(ScanCommand).resolves({ Items: [dallasMemphis, memphisAtlanta, awayToDenver] });

    const chains = await searchCorridorChains(CITIES.dallas, CITIES.atlanta, CITIES.dallas);

    expect(chains).toHaveLength(1);
    const [chain] = chains;
    expect(chain.legs.map(l => l.load.loadId)).toEqual(['LEG1', 'LEG2']);
    expect(chain.totalRevenue).toBeCloseTo(3.0 * 450 + 3.2 * 390);
    expect(chain.totalDeadhead).toBe(0);
    expect(chain.totalMiles).toBe(450 + 390);
    expect(chain.revenuePerMile).toBeCloseTo(chain.totalRevenue / chain.totalMiles);
    expect(chain.summary).toBe('Dallas, TX → Memphis, TN → Atlanta, GA');
    expect(chain.chainId).toMatch(/^CHAIN-[0-9a-f]{8}$/);
    expect(chain.chainScore).toBeCloseTo(calculateChainScore(chain));
  });

  it('treats a load that already ends near the destination as a one-leg chain', async () => {
    ddb.on(ScanCommand).resolves({ Items: [directDallasAtlanta] });
    const chains = await searchCorridorChains(CITIES.dallas, CITIES.atlanta, CITIES.dallas);
    expect(chains).toHaveLength(1);
    expect(chains[0].legs).toHaveLength(1);
    expect(chains[0].totalRevenue).toBeCloseTo(1.8 * 780);
  });

  it('does not build second legs when maxLegs is 1', async () => {
    ddb.on(ScanCommand).resolves({ Items: [dallasMemphis, memphisAtlanta] });
    expect(await searchCorridorChains(CITIES.dallas, CITIES.atlanta, CITIES.dallas, undefined, undefined, 1)).toEqual([]);
  });

  it('ignores first legs that head away from the destination', async () => {
    const denverAtlanta = makeLoad({ loadId: 'X', origin: loc('denver'), destination: loc('atlanta') });
    ddb.on(ScanCommand).resolves({ Items: [awayToDenver, denverAtlanta] });
    expect(await searchCorridorChains(CITIES.dallas, CITIES.atlanta, CITIES.dallas)).toEqual([]);
  });

  it('ranks chains by score and returns at most 10', async () => {
    const secondLegs = Array.from({ length: 12 }, (_, i) =>
      makeLoad({ ...memphisAtlanta, loadId: `LEG2-${i}`, postedRate: 2.0 + i * 0.1 }));
    // A modest first leg keeps every chain score below the 10-point cap, so the ordering is strict at the top.
    const modestFirstLeg = makeLoad({ ...dallasMemphis, postedRate: 2.0 });
    ddb.on(ScanCommand).resolves({ Items: [modestFirstLeg, ...secondLegs] });

    const chains = await searchCorridorChains(CITIES.dallas, CITIES.atlanta, CITIES.dallas);

    expect(chains).toHaveLength(10);
    const scores = chains.map(c => c.chainScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(chains[0].legs[1].load.loadId).toBe('LEG2-11');
  });
});

// --- Lambda handler ---------------------------------------------------------------------

describe('corridor-search handler', () => {
  const driver = makeDriver();
  const invoke = async (body: unknown) => parseResponse(await handler(apiEvent({ body: body === undefined ? null : JSON.stringify(body) })) as any);

  beforeEach(() => {
    ddb.on(GetCommand).resolves({ Item: driver });
  });

  it('rejects a missing body', async () => {
    expect((await invoke(undefined)).status).toBe(400);
  });

  it('rejects a request without driverId', async () => {
    const res = await invoke({ originCity: 'Dallas', originState: 'TX' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('driverId');
  });

  it('rejects an unknown driver', async () => {
    ddb.on(GetCommand).resolves({});
    const res = await invoke({ driverId: 'nobody', originCity: 'Dallas', originState: 'TX' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not found');
  });

  it('requires an origin', async () => {
    const res = await invoke({ driverId: driver.driverId, destCity: 'Atlanta', destState: 'GA' });
    expect(res.status).toBe(400);
  });

  it('requires a destination for one-way searches', async () => {
    const res = await invoke({ driverId: driver.driverId, originCity: 'Dallas', originState: 'TX' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Unsupported search mode');
  });

  it('returns a strong direct load without searching for chains', async () => {
    const strong = makeLoad({ loadId: 'STRONG', postedRate: 3.5, marketRateAvg: 2.8 });
    ddb.on(ScanCommand).resolves({ Items: [strong, dallasMemphis, memphisAtlanta] });

    const res = await invoke({ driverId: driver.driverId, originCity: 'Dallas', originState: 'TX', destCity: 'Atlanta', destState: 'GA' });

    expect(res.status).toBe(200);
    expect(res.body.directLoads[0].load.loadId).toBe('STRONG');
    expect(res.body.directLoads[0].tripScore).toBeGreaterThanOrEqual(7);
    expect(res.body.chains).toEqual([]);
    expect(res.body.marketInsight.bestOption).toBe('direct');
    expect(ddb.commandCalls(ScanCommand)).toHaveLength(1);
  });

  it('falls back to chain search when the best direct load scores under 7 and recommends the better-paying chain', async () => {
    ddb.on(ScanCommand).resolves({ Items: [directDallasAtlanta, dallasMemphis, memphisAtlanta] });

    const res = await invoke({ driverId: driver.driverId, originCity: 'Dallas', originState: 'TX', destCity: 'Atlanta', destState: 'GA' });

    expect(res.status).toBe(200);
    expect(res.body.directLoads[0].tripScore).toBeLessThan(7);
    expect(ddb.commandCalls(ScanCommand)).toHaveLength(2);
    const twoLeg = res.body.chains.find((c: LoadChain) => c.legs.length === 2);
    expect(twoLeg.summary).toBe('Dallas, TX → Memphis, TN → Atlanta, GA');
    expect(res.body.marketInsight.bestOption).toBe('chain');
    expect(res.body.marketInsight.savingsVsDirect).toBeGreaterThan(50);
  });

  it('supports corridor_chain mode with nested origin/destination objects', async () => {
    ddb.on(ScanCommand).resolves({ Items: [dallasMemphis, memphisAtlanta] });

    const res = await invoke({
      driverId: driver.driverId, searchMode: 'corridor_chain', origin: CITIES.dallas, destination: CITIES.atlanta,
    });

    expect(res.status).toBe(200);
    expect(res.body.searchMode).toBe('corridor_chain');
    expect(res.body.directLoads).toEqual([]);
    expect(res.body.chains).toHaveLength(1);
    expect(res.body.metadata.chainsEvaluated).toBe(1);
  });

  it('falls back to the driver location for an origin city it has no coordinates for', async () => {
    const atDriver = makeLoad({ loadId: 'NEAR', origin: loc('memphis'), postedRate: 3.5, marketRateAvg: 2.8 });
    ddb.on(GetCommand).resolves({ Item: makeDriver({ currentLocation: CITIES.memphis }) });
    ddb.on(ScanCommand).resolves({ Items: [atDriver] });

    const res = await invoke({ driverId: driver.driverId, originCity: 'Smallville', originState: 'TN', destCity: 'Atlanta', destState: 'GA' });

    expect(res.body.directLoads.map((d: LoadWithScore) => d.load.loadId)).toEqual(['NEAR']);
  });

  it('returns 500 when DynamoDB fails', async () => {
    ddb.on(ScanCommand).rejects(new Error('boom'));
    const res = await invoke({ driverId: driver.driverId, originCity: 'Dallas', originState: 'TX', destCity: 'Atlanta', destState: 'GA' });
    expect(res.status).toBe(500);
  });
});
