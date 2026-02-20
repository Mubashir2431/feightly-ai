# Implementation Tasks: Corridor Search & Load Chaining

## Overview
Implement the core competitive advantage of feightly.ai: intelligent multi-leg load chain discovery with 5 search modes.

## Tasks

- [x] 1. Create Corridor Search Lambda (backend/lambda/corridor-search.ts)
  - [x] 1.1 Set up Lambda structure with imports and interfaces
  - [x] 1.2 Implement request body parsing (flat and nested formats)
  - [x] 1.3 Implement helper functions (normalize, calculateTripScore, calculateChainScore)
  - [x] 1.4 Implement isTowardDestination logic
  - [x] 1.5 Implement findAvailableLoads with equipment and minRate filtering
  - [x] 1.6 Implement getDriver function
  - [x] 1.7 Implement searchDirectLoads (one_way mode)
  - [x] 1.8 Implement searchCorridorChains (corridor_chain mode)
  - [x] 1.9 Implement generateMarketInsight with savingsVsDirect
  - [x] 1.10 Implement main handler with mode routing
  - [x] 1.11 Add comprehensive error handling and logging

- [x] 2. Create Broker Simulator Lambda (backend/lambda/broker-simulator.ts)
  - [x] 2.1 Set up Lambda structure with imports and interfaces
  - [x] 2.2 Implement randomDelay helper
  - [x] 2.3 Implement generateBrokerMessage with realistic messages
  - [x] 2.4 Implement simulateBrokerResponse with corrected logic:
    - Driver offers ABOVE posted rate
    - Within 5% above market → accept
    - 5-15% above posted → counter halfway
    - >15% above market → reject
    - Final round → accept at last counter
  - [x] 2.5 Implement main handler with validation
  - [x] 2.6 Add error handling and logging

- [x] 3. Add Corridor Search Lambda to CDK Stack
  - [x] 3.1 Create CorridorSearchLambda function resource
  - [x] 3.2 Configure 60 second timeout
  - [x] 3.3 Configure 1024 MB memory
  - [x] 3.4 Set environment variables (LOADS_TABLE_NAME, DRIVERS_TABLE_NAME)
  - [x] 3.5 Add POST /loads/smart-search endpoint to API Gateway
  - [x] 3.6 Configure CORS for smart-search endpoint
  - [x] 3.7 Use existing Lambda execution role

- [x] 4. Add Broker Simulator Lambda to CDK Stack
  - [x] 4.1 Create BrokerSimulatorLambda function resource
  - [x] 4.2 Configure 30 second timeout
  - [x] 4.3 Configure 512 MB memory
  - [x] 4.4 Add POST /simulate-broker-response endpoint to API Gateway
  - [x] 4.5 Configure CORS for simulate-broker-response endpoint
  - [x] 4.6 Use existing Lambda execution role

- [x] 5. Compile TypeScript
  - [x] 5.1 Run npx tsc in backend/lambda directory
  - [x] 5.2 Verify no compilation errors
  - [x] 5.3 Check generated .js files

- [x] 6. Deploy to AWS (USER ACTION REQUIRED)
  - [x] 6.1 Set environment variables (OPENAI_API_KEY, N8N_WEBHOOK_URL, N8N_AUTOMATION_SECRET)
  - [x] 6.2 Run npx cdk deploy --require-approval never
  - [x] 6.3 Verify deployment success
  - [x] 6.4 Note API Gateway URLs

- [x] 7. Test Corridor Search Endpoint (USER ACTION REQUIRED)
  - [x] 7.1 Test Philadelphia to Miami (should find chains)
  - [x] 7.2 Test Dallas to Atlanta (should find direct loads)
  - [x] 7.3 Test with minRate filtering
  - [x] 7.4 Test with equipment filtering
  - [x] 7.5 Verify marketInsight response structure
  - [x] 7.6 Verify chain scoring and ranking

- [x] 8. Test Broker Simulator Endpoint (USER ACTION REQUIRED)
  - [x] 8.1 Test driver offer at posted rate (should accept)
  - [x] 8.2 Test driver offer 5% above market (should accept)
  - [x] 8.3 Test driver offer 10% above posted (should counter)
  - [x] 8.4 Test driver offer 20% above market (should reject)
  - [x] 8.5 Test final round behavior (should accept)
  - [x] 8.6 Verify realistic delay times

## Implementation Strategy

### Phase 1: Core Lambda Functions (Tasks 1-2)
1. Start with corridor-search.ts
   - Build incrementally: helpers → search functions → handler
   - Test each function as we build
2. Then broker-simulator.ts
   - Simpler Lambda, should be quick

### Phase 2: CDK Integration (Tasks 3-4)
1. Add both Lambdas to CDK stack
2. Configure API Gateway endpoints
3. Verify CDK synth works

### Phase 3: Deploy & Test (Tasks 5-8)
1. Compile TypeScript
2. Deploy to AWS
3. Test both endpoints with real requests

## Notes

- Skip all unit tests and property-based tests for MVP speed
- Focus on core functionality only
- Use existing shared utilities (calculateDistance, response helpers)
- Reuse existing DynamoDB tables and IAM roles
- Test manually with curl or Postman after deployment

## Design Adjustments Applied

1. ✅ Request body accepts both flat format (from copilot) and nested format
2. ✅ Added minRate filtering in findAvailableLoads
3. ✅ Added marketInsight to response with savingsVsDirect
4. ✅ Fixed broker simulator logic (driver offers ABOVE posted rate)
5. ✅ Skipping all tests, only implementing core Lambdas and deployment
