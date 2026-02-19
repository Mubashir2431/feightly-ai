#!/usr/bin/env ts-node
/**
 * Seed script to insert a test driver into Feightly-Drivers DynamoDB table
 * Usage: npx ts-node scripts/seed-driver.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
const TABLE_NAME = 'Feightly-Drivers';

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

// Test driver data
const testDriver = {
  driverId: "DRIVER-001",
  name: "Marcus Johnson",
  email: "marcus@feightly.ai",
  phone: "+1-214-555-0142",
  homeBase: {
    city: "Dallas",
    state: "TX",
    lat: 32.7767,
    lng: -96.797
  },
  currentLocation: {
    city: "Dallas",
    state: "TX",
    lat: 32.7767,
    lng: -96.797
  },
  equipment: "Dry Van",
  mcNumber: "MC-123456",
  dotNumber: "DOT-789012",
  rating: 4.8,
  loadsCompleted: 247,
  totalEarnings: 412500,
  avgRate: 2.65,
  minRate: 2.30,
  preferredLanes: ["Dallas-Atlanta", "Dallas-Chicago", "Dallas-Memphis"],
  avoidRegions: ["Northeast"],
  status: "available",
  createdAt: new Date().toISOString()
};

// Insert driver into DynamoDB
async function seedDriver() {
  console.log('🚀 Starting driver seed process...');
  console.log(`📊 Inserting test driver into table: ${TABLE_NAME}`);
  console.log(`🌎 Region: ${REGION}\n`);
  
  console.log('👤 Driver Details:');
  console.log(`  ID: ${testDriver.driverId}`);
  console.log(`  Name: ${testDriver.name}`);
  console.log(`  Email: ${testDriver.email}`);
  console.log(`  Home: ${testDriver.homeBase.city}, ${testDriver.homeBase.state}`);
  console.log(`  Equipment: ${testDriver.equipment}`);
  console.log(`  Rating: ${testDriver.rating}/5.0`);
  console.log(`  Loads Completed: ${testDriver.loadsCompleted}`);
  console.log(`  Total Earnings: $${testDriver.totalEarnings.toLocaleString()}`);
  console.log(`  Avg Rate: $${testDriver.avgRate}/mile\n`);
  
  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: testDriver
    }));
    
    console.log('==========================================');
    console.log('✅ Driver inserted successfully!');
    console.log('==========================================');
    console.log(`✓ Driver ID: ${testDriver.driverId}`);
    console.log(`✓ Name: ${testDriver.name}`);
    console.log('\n🎯 Next steps:');
    console.log('  1. Verify driver in DynamoDB console');
    console.log('  2. Test negotiate endpoint with this driver');
    console.log('  3. Test driver dashboard: GET /driver/DRIVER-001/dashboard');
    
  } catch (error: any) {
    console.error('\n❌ Error inserting driver:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.error(`\n⚠️  Table "${TABLE_NAME}" not found in region ${REGION}`);
      console.error('   Make sure the backend stack is deployed.');
    }
    
    throw error;
  }
}

// Run the seed script
seedDriver()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
