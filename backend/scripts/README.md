# Feightly Backend Scripts

This directory contains utility scripts for managing the Feightly backend infrastructure.

## Available Scripts

### seed-loads.ts

Populates the DynamoDB Loads table with 150 realistic mock freight loads across 20 major US markets.

**Usage:**
```bash
npx ts-node scripts/seed-loads.ts
```

**Prerequisites:**
- AWS CLI configured with valid credentials
- DynamoDB table `Feightly-Loads` must exist (created by CDK deployment)
- AWS credentials must have DynamoDB PutItem permissions

**What it does:**
- Generates 150 freight loads across 20 markets
- Uses real city coordinates and realistic distances
- Applies market-based rate ranges (headhaul, balanced, backhaul)
- Creates diverse equipment types (Dry Van 60%, Reefer 25%, Flatbed 15%)
- Assigns booking types (negotiable 47%, book_now 27%, hot 17%, partial 9%)
- Generates realistic pickup dates (next 7 days) and delivery deadlines
- Includes broker information with ratings and payment terms

**Market Distribution:**
- Dallas/DFW: 12 loads (headhaul market, $2.30-3.00/mi)
- Chicago: 12 loads (headhaul market, $2.30-2.90/mi)
- Atlanta: 10 loads (balanced market, $2.00-2.50/mi)
- Philadelphia: 8 loads (balanced market, $2.10-2.60/mi)
- Miami: 8 loads (backhaul market, $1.50-2.00/mi)
- Houston: 8 loads (headhaul market, $2.20-2.80/mi)
- Memphis: 8 loads (balanced market, $2.00-2.50/mi)
- Los Angeles: 8 loads (headhaul market, $2.40-3.00/mi)
- And 12 more markets...

**Output:**
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
```

## Running Scripts

All scripts use TypeScript and can be run with `ts-node`:

```bash
# From the backend directory
npx ts-node scripts/<script-name>.ts
```

## Troubleshooting

### "Cannot find module 'ts-node'"
Install ts-node as a dev dependency:
```bash
npm install --save-dev ts-node
```

### "AWS credentials not configured"
Configure AWS CLI:
```bash
aws configure
```

### "Table does not exist"
Deploy the CDK stack first:
```bash
npx cdk deploy
```

### "Access Denied"
Ensure your AWS credentials have the necessary permissions:
- DynamoDB: PutItem, GetItem, Scan, Query
- CloudFormation: DescribeStacks (to get table name)

## Adding New Scripts

When creating new scripts:

1. Create the script in `backend/scripts/`
2. Use TypeScript for type safety
3. Add proper error handling
4. Include progress indicators for long-running operations
5. Document the script in this README
6. Use environment variables for configuration when appropriate

Example template:
```typescript
#!/usr/bin/env ts-node
/**
 * Script description
 * Usage: npx ts-node scripts/my-script.ts
 */

async function main() {
  console.log('Starting...');
  // Your code here
  console.log('Done!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```
