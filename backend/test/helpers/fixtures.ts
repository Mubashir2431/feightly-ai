import { APIGatewayProxyEvent } from 'aws-lambda';
import { Driver, Load, Location } from '../../lambda/shared/types';

// Real city coordinates, so distances in tests match what the Haversine helper returns in production.
export const CITIES = {
  dallas: { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
  atlanta: { city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
  memphis: { city: 'Memphis', state: 'TN', lat: 35.1495, lng: -90.049 },
  birmingham: { city: 'Birmingham', state: 'AL', lat: 33.5207, lng: -86.8025 },
  chicago: { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  denver: { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
};

type CityKey = keyof typeof CITIES;

export function loc(key: CityKey): Location {
  return { ...CITIES[key], address: `1 Main St, ${CITIES[key].city}` };
}

export function makeLoad(overrides: Partial<Load> = {}): Load {
  return {
    loadId: 'LOAD-1',
    origin: loc('dallas'),
    destination: loc('atlanta'),
    distanceMiles: 780,
    equipment: 'Dry Van',
    weightLbs: 40000,
    postedRate: 2.5,
    marketRateAvg: 2.5,
    marketRateHigh: 2.9,
    marketRateLow: 2.1,
    rateTrend: 'stable',
    bookingType: 'book_now',
    broker: {
      name: 'Test Logistics',
      contact: 'Jane Broker',
      email: 'jane@example.com',
      phone: '555-0100',
      rating: 4.5,
      paymentTerms: 'Net 30',
      onTimePayment: 0.97,
    },
    pickupWindow: '2026-01-01 08:00-12:00',
    deliveryDeadline: '2026-01-02 17:00',
    status: 'available',
    ...overrides,
  };
}

export function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    driverId: 'DRIVER-1',
    name: 'Test Driver',
    homeBase: CITIES.dallas,
    currentLocation: CITIES.dallas,
    equipment: 'Dry Van',
    preferredLanes: [],
    avoidRegions: [],
    minRate: 2.0,
    ...overrides,
  };
}

export function apiEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '/',
    ...overrides,
  };
}

export function parseResponse(result: { statusCode: number; body: string }) {
  return { status: result.statusCode, body: JSON.parse(result.body) };
}
