import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { parseCounterOffer } from '../lambda/broker-response';
import {
  buildSearchParams,
  findNearestCity,
  generateCopilotMessage,
  handler,
  ParsedIntent,
  parseIntentJson,
  stripCodeFences,
} from '../lambda/copilot';
import { apiEvent, parseResponse } from './helpers/fixtures';

const bedrock = mockClient(BedrockRuntimeClient);

beforeEach(() => {
  bedrock.reset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

const INTENT: ParsedIntent = {
  tripType: 'one_way',
  originCity: 'Dallas',
  originState: 'TX',
  destCity: 'Atlanta',
  destState: 'GA',
  equipment: 'Dry Van',
  minRate: 2.3,
  maxDeadhead: null,
  homeCity: null,
  homeState: null,
  timeConstraint: null,
  avoidRegions: null,
  notes: '',
};

/** Shape of an Anthropic Messages response as returned by Bedrock InvokeModel */
function bedrockReply(text: string) {
  return { body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' })) } as any;
}

describe('stripCodeFences / parseIntentJson (LLM output parsing)', () => {
  const json = JSON.stringify(INTENT);

  it('parses bare JSON', () => {
    expect(parseIntentJson(json)).toEqual(INTENT);
  });

  it('parses JSON wrapped in a ```json fence', () => {
    expect(parseIntentJson('```json\n' + json + '\n```')).toEqual(INTENT);
  });

  it('parses JSON wrapped in a plain ``` fence with surrounding whitespace', () => {
    expect(parseIntentJson('  \n```\n' + json + '\n```  \n')).toEqual(INTENT);
  });

  it('leaves unfenced text untouched apart from trimming', () => {
    expect(stripCodeFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('throws on prose instead of JSON', () => {
    expect(() => parseIntentJson('Sure! Here are the parameters you asked for.')).toThrow(SyntaxError);
  });

  it('throws on truncated JSON (e.g. max_tokens cut-off)', () => {
    expect(() => parseIntentJson(json.slice(0, 40))).toThrow();
  });
});

describe('buildSearchParams', () => {
  it('maps the parsed intent to load-search parameters and drops nulls', () => {
    expect(buildSearchParams(INTENT)).toEqual({ originCity: 'Dallas', destCity: 'Atlanta', equipment: 'Dry Van', minRate: 2.3 });
  });

  it('keeps zero-valued numeric filters', () => {
    expect(buildSearchParams({ ...INTENT, minRate: 0, maxDeadhead: 0 })).toMatchObject({ minRate: 0, maxDeadhead: 0 });
  });

  it('returns an empty object for an open-ended request', () => {
    expect(buildSearchParams({ ...INTENT, originCity: null, destCity: null, equipment: null, minRate: null })).toEqual({});
  });
});

describe('generateCopilotMessage', () => {
  it('summarises a one-way request', () => {
    expect(generateCopilotMessage(INTENT)).toBe('Looking for loads from Dallas, TX to Atlanta, GA (Dry Van) at $2.30/mile or better...');
  });

  it('phrases backhaul, round trip and open-ended trips differently', () => {
    expect(generateCopilotMessage({ ...INTENT, tripType: 'backhaul' })).toMatch(/^Got it! Looking for loads to get you home/);
    expect(generateCopilotMessage({ ...INTENT, tripType: 'round_trip' })).toMatch(/^Looking for round trip loads/);
    expect(generateCopilotMessage({ ...INTENT, tripType: 'open_ended' })).toMatch(/^Searching for available loads/);
  });

  it('mentions time constraints and regions to avoid', () => {
    const msg = generateCopilotMessage({ ...INTENT, timeConstraint: 'by Friday', avoidRegions: ['Northeast', 'I-80'] });
    expect(msg).toContain('- need to arrive by Friday');
    expect(msg).toContain('- avoiding Northeast, I-80');
  });
});

describe('findNearestCity', () => {
  it('reverse-geocodes coordinates to the closest major city', () => {
    expect(findNearestCity(32.9, -96.9)).toEqual({ city: 'Dallas', state: 'TX' });
    expect(findNearestCity(41.5, -87.5)).toEqual({ city: 'Chicago', state: 'IL' });
  });
});

describe('copilot handler with Bedrock mocked', () => {
  const invoke = async (body: unknown) =>
    parseResponse((await handler(apiEvent({ body: body === undefined ? null : JSON.stringify(body) }))) as any);

  it('validates text and driverId', async () => {
    expect((await invoke(undefined)).status).toBe(400);
    expect((await invoke({ driverId: 'D1' })).status).toBe(400);
    expect((await invoke({ text: 'Dallas to Atlanta' })).status).toBe(400);
    expect(bedrock.commandCalls(InvokeModelCommand)).toHaveLength(0);
  });

  it('turns a fenced model reply into search params and a confirmation message', async () => {
    bedrock.on(InvokeModelCommand).resolves(bedrockReply('```json\n' + JSON.stringify(INTENT) + '\n```'));

    const res = await invoke({ text: 'Dallas to Atlanta, dry van, two thirty minimum', driverId: 'D1' });

    expect(res.status).toBe(200);
    expect(res.body.parsed).toEqual(INTENT);
    expect(res.body.searchParams).toEqual({ originCity: 'Dallas', destCity: 'Atlanta', equipment: 'Dry Van', minRate: 2.3 });
    expect(res.body.copilotMessage).toContain('from Dallas, TX to Atlanta, GA');

    const request = JSON.parse(bedrock.commandCalls(InvokeModelCommand)[0].args[0].input.body as string);
    expect(request.messages).toEqual([{ role: 'user', content: 'Dallas to Atlanta, dry van, two thirty minimum' }]);
    expect(request.temperature).toBeLessThanOrEqual(0.2);
  });

  it('fills a missing origin from the driver GPS position', async () => {
    bedrock.on(InvokeModelCommand).resolves(bedrockReply(JSON.stringify({ ...INTENT, tripType: 'open_ended', originCity: null, originState: null })));

    const res = await invoke({ text: 'what is near me', driverId: 'D1', currentLat: 33.7, currentLng: -84.4 });

    expect(res.body.parsed).toMatchObject({ originCity: 'Atlanta', originState: 'GA' });
    expect(res.body.searchParams.originCity).toBe('Atlanta');
  });

  it('returns 500 when the model replies with something that is not JSON', async () => {
    bedrock.on(InvokeModelCommand).resolves(bedrockReply('I could not understand that request.'));
    const res = await invoke({ text: 'hmm', driverId: 'D1' });
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Failed to parse intent');
  });

  it('returns 503 when Bedrock throttles', async () => {
    const throttled = Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' });
    bedrock.on(InvokeModelCommand).rejects(throttled);
    expect((await invoke({ text: 'Dallas to Atlanta', driverId: 'D1' })).status).toBe(503);
  });
});

describe('parseCounterOffer (broker email parsing)', () => {
  it('prefers an explicit counter-offer value', () => {
    expect(parseCounterOffer('We can do $2.10/mile', 2.45)).toBe(2.45);
  });

  it.each([
    ['We can do $2.75/mile on this one.', 2.75],
    ['Best I have is $2.60 per mile', 2.6],
    ['Final offer 2.40/mi', 2.4],
    ['$3 / mile, take it or leave it', 3],
    ['How about $2.55/MILE?', 2.55],
  ])('extracts the rate from "%s"', (email, rate) => {
    expect(parseCounterOffer(email)).toBe(rate);
  });

  it('returns null when no per-mile rate is present', () => {
    expect(parseCounterOffer('Let me check with my manager and get back to you.')).toBeNull();
    expect(parseCounterOffer('The total is $1,950 all in.')).toBeNull();
  });

  it('ignores a zero rate', () => {
    expect(parseCounterOffer('$0/mile')).toBeNull();
  });
});
