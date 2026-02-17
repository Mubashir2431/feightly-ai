#!/usr/bin/env ts-node
/**
 * Seed script to populate Feightly-Loads DynamoDB table with 150 mock freight loads
 * Usage: npx ts-node scripts/seed-loads.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
const TABLE_NAME = 'Feightly-Loads';

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

// City data with real coordinates
const CITIES = {
  'Dallas': { state: 'TX', lat: 32.7767, lng: -96.7970 },
  'Atlanta': { state: 'GA', lat: 33.7490, lng: -84.3880 },
  'Chicago': { state: 'IL', lat: 41.8781, lng: -87.6298 },
  'Philadelphia': { state: 'PA', lat: 39.9526, lng: -75.1652 },
  'Miami': { state: 'FL', lat: 25.7617, lng: -80.1918 },
  'Houston': { state: 'TX', lat: 29.7604, lng: -95.3698 },
  'Memphis': { state: 'TN', lat: 35.1495, lng: -90.0490 },
  'Los Angeles': { state: 'CA', lat: 34.0522, lng: -118.2437 },
  'Charlotte': { state: 'NC', lat: 35.2271, lng: -80.8431 },
  'Jacksonville': { state: 'FL', lat: 30.3322, lng: -81.6557 },
  'Nashville': { state: 'TN', lat: 36.1627, lng: -86.7816 },
  'Indianapolis': { state: 'IN', lat: 39.7684, lng: -86.1581 },
  'Kansas City': { state: 'MO', lat: 39.0997, lng: -94.5786 },
  'New Orleans': { state: 'LA', lat: 29.9511, lng: -90.0715 },
  'Denver': { state: 'CO', lat: 39.7392, lng: -104.9903 },
  'Phoenix': { state: 'AZ', lat: 33.4484, lng: -112.0740 },
  'Little Rock': { state: 'AR', lat: 34.7465, lng: -92.2896 },
  'Birmingham': { state: 'AL', lat: 33.5186, lng: -86.8104 },
  'Richmond': { state: 'VA', lat: 37.5407, lng: -77.4360 },
  'Baltimore': { state: 'MD', lat: 39.2904, lng: -76.6122 },
  'New York': { state: 'NY', lat: 40.7128, lng: -74.0060 },
};

// Market definitions with load counts and destinations
const MARKETS: Array<{ origin: string; count: number; destinations: string[]; rateRange: [number, number] }> = [
  { origin: 'Dallas', count: 12, destinations: ['Atlanta', 'Memphis', 'Houston', 'Chicago', 'Phoenix'], rateRange: [2.30, 3.00] },
  { origin: 'Atlanta', count: 10, destinations: ['Dallas', 'Jacksonville', 'Charlotte', 'Memphis', 'Chicago'], rateRange: [2.00, 2.50] },
  { origin: 'Chicago', count: 12, destinations: ['Memphis', 'Dallas', 'Atlanta', 'Indianapolis', 'Kansas City'], rateRange: [2.30, 2.90] },
  { origin: 'Philadelphia', count: 8, destinations: ['Charlotte', 'Richmond', 'Atlanta', 'Baltimore', 'Nashville'], rateRange: [2.10, 2.60] },
  { origin: 'Miami', count: 8, destinations: ['Jacksonville', 'Atlanta', 'Charlotte'], rateRange: [1.50, 2.00] },
  { origin: 'Houston', count: 8, destinations: ['Dallas', 'Memphis', 'Atlanta', 'New Orleans', 'Phoenix'], rateRange: [2.20, 2.80] },
  { origin: 'Memphis', count: 8, destinations: ['Dallas', 'Chicago', 'Atlanta', 'Nashville', 'Little Rock'], rateRange: [2.00, 2.50] },
  { origin: 'Los Angeles', count: 8, destinations: ['Phoenix', 'Dallas', 'Denver', 'Houston'], rateRange: [2.40, 3.00] },
  { origin: 'Charlotte', count: 6, destinations: ['Atlanta', 'Jacksonville', 'Richmond', 'Philadelphia'], rateRange: [2.00, 2.50] },
  { origin: 'Jacksonville', count: 6, destinations: ['Atlanta', 'Miami', 'Charlotte', 'Memphis'], rateRange: [1.60, 2.10] },
  { origin: 'Nashville', count: 6, destinations: ['Memphis', 'Atlanta', 'Chicago', 'Dallas'], rateRange: [2.00, 2.50] },
  { origin: 'Indianapolis', count: 6, destinations: ['Chicago', 'Memphis', 'Dallas', 'Atlanta'], rateRange: [2.00, 2.50] },
  { origin: 'Kansas City', count: 5, destinations: ['Dallas', 'Chicago', 'Memphis', 'Denver'], rateRange: [2.10, 2.60] },
  { origin: 'New Orleans', count: 5, destinations: ['Houston', 'Dallas', 'Memphis', 'Atlanta'], rateRange: [1.90, 2.40] },
  { origin: 'Denver', count: 5, destinations: ['Dallas', 'Kansas City', 'Phoenix', 'Chicago'], rateRange: [2.20, 2.80] },
  { origin: 'Phoenix', count: 5, destinations: ['Los Angeles', 'Dallas', 'Denver', 'Houston'], rateRange: [2.10, 2.70] },
  { origin: 'Little Rock', count: 4, destinations: ['Memphis', 'Dallas', 'Houston', 'Atlanta'], rateRange: [1.90, 2.40] },
  { origin: 'Birmingham', count: 4, destinations: ['Atlanta', 'Memphis', 'Nashville', 'Jacksonville'], rateRange: [1.90, 2.40] },
  { origin: 'Richmond', count: 4, destinations: ['Philadelphia', 'Charlotte', 'Baltimore', 'Atlanta'], rateRange: [2.00, 2.50] },
  { origin: 'Baltimore', count: 4, destinations: ['Philadelphia', 'Richmond', 'Charlotte', 'New York'], rateRange: [2.00, 2.50] },
];

const EQUIPMENT_TYPES = ['Dry Van', 'Reefer', 'Flatbed'];
const BOOKING_TYPES = ['book_now', 'negotiable', 'hot', 'partial'];
const COMMODITIES = [
  'General Freight', 'Food Products', 'Electronics', 'Auto Parts',
  'Building Materials', 'Paper Products', 'Plastics', 'Machinery',
  'Beverages', 'Furniture', 'Textiles', 'Chemicals', 'Metal Products'
];

const BROKERS = [
  { name: 'TQL Freight', email: 'dispatch@tql.com', phone: '+1-513-831-2000' },
  { name: 'C.H. Robinson', email: 'loads@chrobinson.com', phone: '+1-800-323-7587' },
  { name: 'XPO Logistics', email: 'carrier@xpo.com', phone: '+1-844-742-5976' },
  { name: 'Coyote Logistics', email: 'dispatch@coyote.com', phone: '+1-877-269-6831' },
  { name: 'Echo Global', email: 'loads@echo.com', phone: '+1-800-354-7993' },
  { name: 'Landstar', email: 'dispatch@landstar.com', phone: '+1-877-696-4507' },
  { name: 'J.B. Hunt', email: 'carrier@jbhunt.com', phone: '+1-800-643-3622' },
  { name: 'Schneider', email: 'loads@schneider.com', phone: '+1-800-558-6767' },
];

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Random number between min and max
function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(random(min, max + 1));
}

// Random element from array
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Weighted random selection
function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Generate pickup date within next 7 days
function generatePickupDate(): string {
  const days = randomInt(0, 7);
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(randomInt(6, 18), 0, 0, 0);
  return date.toISOString();
}

// Generate delivery deadline based on distance
function generateDeliveryDeadline(pickupDate: string, distance: number): string {
  const pickup = new Date(pickupDate);
  const transitDays = Math.ceil(distance / 500); // ~500 miles per day
  pickup.setDate(pickup.getDate() + transitDays);
  pickup.setHours(17, 0, 0, 0);
  return pickup.toISOString();
}

// Generate a single load
function generateLoad(loadId: string, origin: string, destination: string, rateRange: [number, number]): any {
  const originData = CITIES[origin as keyof typeof CITIES];
  const destData = CITIES[destination as keyof typeof CITIES];
  
  const distance = calculateDistance(originData.lat, originData.lng, destData.lat, destData.lng);
  const postedRate = parseFloat(random(rateRange[0], rateRange[1]).toFixed(2));
  const marketRateAvg = parseFloat(random(rateRange[0] + 0.1, rateRange[1] - 0.1).toFixed(2));
  const marketRateHigh = parseFloat((marketRateAvg + random(0.15, 0.30)).toFixed(2));
  const marketRateLow = parseFloat((marketRateAvg - random(0.15, 0.30)).toFixed(2));
  
  const equipment = weightedRandom(EQUIPMENT_TYPES, [60, 25, 15]);
  const bookingType = weightedRandom(BOOKING_TYPES, [27, 47, 17, 9]);
  const bookNowRate = bookingType === 'book_now' ? parseFloat((postedRate * random(1.10, 1.15)).toFixed(2)) : undefined;
  
  const weight = randomInt(20000, 44000);
  const pickupDate = generatePickupDate();
  const deliveryDeadline = generateDeliveryDeadline(pickupDate, distance);
  
  const broker = randomElement(BROKERS);
  const brokerRating = parseFloat(random(3.5, 5.0).toFixed(1));
  
  const rateTrends = ['rising', 'falling', 'stable'];
  const rateTrend = weightedRandom(rateTrends, [25, 25, 50]);
  
  const commodity = randomElement(COMMODITIES);
  
  return {
    loadId,
    origin: {
      city: origin,
      state: originData.state,
      lat: originData.lat,
      lng: originData.lng,
      address: `${randomInt(100, 9999)} ${randomElement(['Main', 'Industrial', 'Commerce', 'Warehouse'])} ${randomElement(['St', 'Blvd', 'Ave', 'Dr'])}, ${origin}, ${originData.state}`
    },
    destination: {
      city: destination,
      state: destData.state,
      lat: destData.lat,
      lng: destData.lng,
      address: `${randomInt(100, 9999)} ${randomElement(['Main', 'Industrial', 'Commerce', 'Warehouse'])} ${randomElement(['St', 'Blvd', 'Ave', 'Dr'])}, ${destination}, ${destData.state}`
    },
    distanceMiles: distance,
    equipment,
    weightLbs: weight,
    postedRate,
    marketRateAvg,
    marketRateHigh,
    marketRateLow,
    rateTrend,
    bookingType,
    ...(bookNowRate && { bookNowRate }),
    broker: {
      name: broker.name,
      contact: `${randomElement(['John', 'Mike', 'Sarah', 'Lisa', 'Tom', 'Amy'])} ${randomElement(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'])}`,
      email: broker.email,
      phone: broker.phone,
      rating: brokerRating,
      paymentTerms: randomElement(['Net 30', 'Net 15', 'Quick Pay']),
      onTimePayment: randomInt(85, 100)
    },
    pickupWindow: pickupDate,
    deliveryDeadline,
    status: 'available',
    commodity,
    createdAt: new Date().toISOString()
  };
}

// Generate all loads
function generateAllLoads(): any[] {
  const loads: any[] = [];
  let loadCounter = 1;
  
  for (const market of MARKETS) {
    for (let i = 0; i < market.count; i++) {
      const destination = randomElement(market.destinations);
      const loadId = `LOAD-${String(loadCounter).padStart(3, '0')}`;
      const load = generateLoad(loadId, market.origin, destination, market.rateRange);
      loads.push(load);
      loadCounter++;
    }
  }
  
  return loads;
}

// Insert loads into DynamoDB
async function seedLoads() {
  console.log('🚀 Starting seed process...');
  console.log(`📊 Generating 150 loads for table: ${TABLE_NAME}`);
  console.log(`🌎 Region: ${REGION}\n`);
  
  const loads = generateAllLoads();
  
  console.log(`✅ Generated ${loads.length} loads`);
  console.log('📤 Inserting loads into DynamoDB...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const load of loads) {
    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: load
      }));
      successCount++;
      process.stdout.write(`\r✓ Inserted ${successCount}/${loads.length} loads`);
    } catch (error) {
      errorCount++;
      console.error(`\n❌ Error inserting ${load.loadId}:`, error);
    }
  }
  
  console.log('\n');
  console.log('==========================================');
  console.log('✅ Seed process complete!');
  console.log('==========================================');
  console.log(`✓ Successfully inserted: ${successCount} loads`);
  console.log(`✗ Failed: ${errorCount} loads`);
  console.log('\n📊 Load Distribution:');
  
  // Show distribution by market
  const distribution = MARKETS.map(m => `  ${m.origin}: ${m.count} loads`).join('\n');
  console.log(distribution);
  
  console.log('\n🎯 Next steps:');
  console.log('  1. Verify loads in DynamoDB console');
  console.log('  2. Test API endpoints with: GET /loads');
  console.log('  3. Try filtering by equipment, origin, or destination');
}

// Run the seed script
seedLoads()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
