# Seed Data Guide

## Overview

This guide explains how to populate your Feightly backend with realistic test data.

## Quick Start

After deploying your backend infrastructure, run:

```bash
cd backend
npx ts-node scripts/seed-loads.ts
```

This will populate your DynamoDB Loads table with 150 realistic freight loads.

## What Gets Created

### 150 Freight Loads Across 20 Markets

**Major Markets (12 loads each):**
- Dallas/DFW → Atlanta, Memphis, Houston, Chicago, Phoenix
- Chicago → Memphis, Dallas, Atlanta, Indianapolis, Kansas City

**Balanced Markets (6-10 loads each):**
- Atlanta, Philadelphia, Houston, Memphis, Los Angeles, Charlotte, Jacksonville, Nashville, Indianapolis

**Smaller Markets (4-5 loads each):**
- Kansas City, New Orleans, Denver, Phoenix, Little Rock, Birmingham, Richmond, Baltimore

### Realistic Data Points

Each load includes:
- **Real coordinates** for origin and destination cities
- **Accurate distances** calculated using Haversine formula
- **Market-based rates**:
  - Headhaul markets (Dallas, Chicago, LA): $2.30-3.00/mi
  - Balanced markets (Atlanta, Charlotte): $2.00-2.50/mi
  - Backhaul markets (Miami, Jacksonville): $1.50-2.00/mi
- **Equipment distribution**:
  - Dry Van: 60%
  - Reefer: 25%
  - Flatbed: 15%
- **Booking types**:
  - Negotiable: 47%
  - Book Now: 27%
  - Hot: 17%
  - Partial: 9%
- **Realistic pickup dates** (next 7 days)
- **Calculated delivery deadlines** based on distance
- **Broker information** with ratings (3.5-5.0)
- **Commodity types** (13 different freight categories)

## Prerequisites

1. **AWS CLI configured:**
   ```bash
   aws configure
   ```

2. **Backend deployed:**
   ```bash
   cd backend
   npx cdk deploy
   ```

3. **Table exists:**
   The `Feightly-Loads` table must be created (happens during CDK deployment)

## Running the Seed Script

```bash
# From the backend directory
npx ts-node scripts/seed-loads.ts
```

**Expected output:**
```
🚀 Starting seed process...
📊 Generating 150 loads for table: Feightly-Loads
🌎 Region: us-east-1

✅ Generated 150 loads
📤 Inserting loads into DynamoDB...

✓ Inserted 150/150 loads

==========================================
✅ Seed process complete!
==========================================
✓ Successfully inserted: 150 loads
✗ Failed: 0 loads

📊 Load Distribution:
  Dallas: 12 loads
  Atlanta: 10 loads
  Chicago: 12 loads
  ...
```

## Verifying the Data

### 1. Check DynamoDB Console

1. Go to AWS Console → DynamoDB
2. Select `Feightly-Loads` table
3. Click "Explore table items"
4. You should see 150 items

### 2. Test API Endpoints

```bash
# Get your API URL from deployment outputs
API_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com/prod"

# Search all loads
curl "$API_URL/loads"

# Filter by equipment
curl "$API_URL/loads?equipment=Dry%20Van"

# Filter by origin city
curl "$API_URL/loads?originCity=Dallas"

# Filter by booking type
curl "$API_URL/loads?bookingType=book_now"

# Get specific load
curl "$API_URL/loads/LOAD-001"
```

### 3. Check Load Distribution

The script creates loads with this distribution:

| Market | Loads | Rate Range | Type |
|--------|-------|------------|------|
| Dallas | 12 | $2.30-3.00/mi | Headhaul |
| Chicago | 12 | $2.30-2.90/mi | Headhaul |
| Atlanta | 10 | $2.00-2.50/mi | Balanced |
| Philadelphia | 8 | $2.10-2.60/mi | Balanced |
| Miami | 8 | $1.50-2.00/mi | Backhaul |
| Houston | 8 | $2.20-2.80/mi | Headhaul |
| Memphis | 8 | $2.00-2.50/mi | Balanced |
| Los Angeles | 8 | $2.40-3.00/mi | Headhaul |
| Others | 76 | Varies | Mixed |

## Re-running the Script

The script will **overwrite** existing loads with the same loadId. To completely refresh the data:

1. **Option A: Delete and re-seed**
   ```bash
   # Delete all items (use with caution!)
   # Then re-run seed script
   npx ts-node scripts/seed-loads.ts
   ```

2. **Option B: Clear table in console**
   - Go to DynamoDB console
   - Select table → Actions → Delete all items
   - Run seed script

## Customizing the Data

To modify the seed data, edit `backend/scripts/seed-loads.ts`:

### Change Number of Loads
```typescript
// Modify the MARKETS array
const MARKETS = [
  { origin: 'Dallas', count: 20, ... }, // Increase from 12 to 20
  ...
];
```

### Add New Markets
```typescript
// Add to CITIES object
const CITIES = {
  ...
  'Seattle': { state: 'WA', lat: 47.6062, lng: -122.3321 },
};

// Add to MARKETS array
const MARKETS = [
  ...
  { origin: 'Seattle', count: 10, destinations: ['Portland', 'Los Angeles'], rateRange: [2.50, 3.20] },
];
```

### Adjust Rate Ranges
```typescript
// Modify rateRange in MARKETS
{ origin: 'Dallas', count: 12, destinations: [...], rateRange: [2.50, 3.50] }, // Higher rates
```

### Change Equipment Distribution
```typescript
// Modify weights in weightedRandom call
const equipment = weightedRandom(EQUIPMENT_TYPES, [70, 20, 10]); // More dry vans
```

## Troubleshooting

### "Table does not exist"
**Problem:** DynamoDB table not created yet

**Solution:**
```bash
cd backend
npx cdk deploy
```

### "Access Denied"
**Problem:** AWS credentials lack DynamoDB permissions

**Solution:** Ensure your IAM user/role has:
- `dynamodb:PutItem`
- `dynamodb:GetItem`
- `dynamodb:Scan`

### "Cannot find module 'ts-node'"
**Problem:** ts-node not installed

**Solution:**
```bash
npm install --save-dev ts-node
```

### Partial Success (some loads failed)
**Problem:** Network issues or rate limiting

**Solution:** Re-run the script - it will overwrite existing loads

## Next Steps

After seeding data:

1. **Test the mobile app** with real load data
2. **Test search filters** (equipment, origin, destination, rates)
3. **Test booking flow** with book_now loads
4. **Test negotiation** with negotiable loads
5. **Monitor DynamoDB usage** in AWS Console

## Cost Considerations

- **DynamoDB:** Pay-per-request pricing
- **150 items:** ~$0.00125 to write (one-time)
- **Storage:** ~$0.25/GB/month (150 loads ≈ 0.5 MB)
- **Reads:** Charged per API request

**Total cost for seed data:** < $0.01

## Support

For issues with the seed script:
1. Check AWS credentials: `aws sts get-caller-identity`
2. Verify table exists: `aws dynamodb describe-table --table-name Feightly-Loads`
3. Check CloudWatch Logs for errors
4. Review script output for specific error messages
