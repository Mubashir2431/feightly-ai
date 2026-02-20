# Deploy Corridor Search & Broker Simulator

## ✅ What's Already Done (by Kiro)

1. ✅ Created `corridor-search.ts` Lambda (510 lines)
2. ✅ Created `broker-simulator.ts` Lambda (180 lines)
3. ✅ Added both to CDK stack with endpoints
4. ✅ Compiled TypeScript successfully
5. ✅ All code ready to deploy

## 🎯 What You Need To Do

### Step 1: Deploy to AWS

Open PowerShell in the `backend` folder and run:

```powershell
npx cdk deploy --require-approval never
```

That's it! CDK will:
- Upload the new Lambda code
- Create the new endpoints
- Update the stack

### Step 2: Test Corridor Search

After deployment, test with:

```powershell
# Test 1: Philadelphia to Miami (should find chains)
$body = @{
    originCity = "Philadelphia"
    originState = "PA"
    destCity = "Miami"
    destState = "FL"
    equipment = "Dry Van"
    driverId = "DRIVER-001"
    searchMode = "corridor_chain"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/loads/smart-search" `
    -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 10
```

```powershell
# Test 2: Dallas to Atlanta (should find direct loads)
$body = @{
    originCity = "Dallas"
    originState = "TX"
    destCity = "Atlanta"
    destState = "GA"
    equipment = "Dry Van"
    driverId = "DRIVER-001"
    searchMode = "one_way"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/loads/smart-search" `
    -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 10
```

### Step 3: Test Broker Simulator

```powershell
# Test 1: Driver offers 10% above posted (should counter)
$body = @{
    negotiationId = "NEG-TEST-001"
    driverOffer = 2.97
    postedRate = 2.70
    marketRateAvg = 2.84
    round = 1
    maxRounds = 4
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/simulate-broker-response" `
    -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
```

```powershell
# Test 2: Final round (should accept)
$body = @{
    negotiationId = "NEG-TEST-002"
    driverOffer = 3.10
    postedRate = 2.70
    marketRateAvg = 2.84
    round = 4
    maxRounds = 4
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/simulate-broker-response" `
    -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
```

## 🔍 What To Look For

### Corridor Search Response:
- `directLoads[]` - Direct loads found
- `chains[]` - Load chains with 2-3 legs
- `marketInsight.bestOption` - "direct" or "chain"
- `marketInsight.savingsVsDirect` - How much more chain pays
- `marketInsight.recommendation` - AI recommendation

### Broker Simulator Response:
- `action` - "accept", "counter", or "reject"
- `brokerOffer` - Counter offer amount (if action is "counter")
- `message` - Realistic broker message
- `delaySeconds` - Simulated response delay

## 📊 Expected Results

### Philadelphia to Miami:
- Should find **chains** (no good direct loads)
- 2-leg chains connecting through intermediate cities
- `marketInsight.bestOption` = "chain"

### Dallas to Atlanta:
- Should find **direct loads**
- Good rates on direct route
- `marketInsight.bestOption` = "direct"

### Broker Simulator:
- Offer at/below posted → **accept**
- Offer 5-15% above → **counter**
- Offer >15% above → **reject**
- Final round → **accept** (broker gives in)

## ❓ Troubleshooting

### If deployment fails:
```powershell
# Check AWS credentials
aws sts get-caller-identity

# If that fails, configure AWS CLI
aws configure
```

### If tests fail:
- Check the API Gateway URL is correct
- Verify DRIVER-001 exists in DynamoDB
- Check CloudWatch logs for errors

## 📝 Summary

**All code is complete and ready!** Just run:
1. `npx cdk deploy` in backend folder
2. Test with the commands above
3. Verify results match expectations

That's it! 🚀
