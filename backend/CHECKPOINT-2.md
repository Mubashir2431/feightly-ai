# Checkpoint 2: Booking and Negotiation Flows

## Status: ✅ COMPLETE

This checkpoint verifies that the booking and negotiation functionality is properly implemented and ready for deployment.

## Completed Components

### 1. Book Load Lambda (Task 6)
- ✅ Lambda function: `book-load.ts`
- ✅ Endpoint: `POST /loads/{loadId}/book`
- ✅ Features:
  - Validates load exists and is available
  - Uses DynamoDB transactions for atomic operations
  - Creates booking record with status "confirmed"
  - Updates load status to "booked"
  - Generates rate confirmation document
  - Uploads document to S3
  - Creates document record in Documents table
  - Handles concurrent booking attempts with 409 Conflict error
  - Comprehensive error handling and logging

### 2. Negotiate Lambda (Task 7)
- ✅ Lambda function: `negotiate.ts`
- ✅ Endpoint: `POST /negotiate`
- ✅ Features:
  - Validates loadId, driverId, and strategy
  - Retrieves load and driver information
  - Generates negotiationId (UUID)
  - Creates negotiation record with status "in_progress"
  - Calls Amazon Bedrock (Claude 3 Haiku) to generate first negotiation email
  - Stores first offer in negotiation record
  - Sends email to n8n webhook URL
  - Returns negotiationId and initial offer details
  - Comprehensive error handling for Bedrock and webhook failures

### 3. Broker Response Lambda (Task 8)
- ✅ Lambda function: `broker-response.ts`
- ✅ Endpoint: `POST /negotiations/{negotiationId}/broker-response`
- ✅ Features:
  - Parses broker's counter-offer from email body
  - Retrieves negotiation record from DynamoDB
  - Implements decision logic:
    - Accepts if broker offer >= driver minimum rate
    - Continues negotiation if currentRound < maxRounds
    - Walks away if maxRounds reached
  - Calls Bedrock to generate counter-offer emails
  - Creates booking when negotiation is accepted
  - Updates negotiation record with all offers
  - Sends counter-offers to n8n webhook
  - Comprehensive error handling and logging

### 4. Negotiation Status Lambda (Task 9)
- ✅ Lambda function: `negotiation-status.ts`
- ✅ Endpoint: `GET /negotiations/{negotiationId}`
- ✅ Features:
  - Retrieves complete negotiation record by ID
  - Returns all offers and current status
  - Returns 404 if negotiation not found
  - Comprehensive error handling and logging

## Verification Results

### Build Status
```bash
npm run build
# ✅ SUCCESS - All TypeScript files compiled without errors
```

### CDK Synthesis
```bash
npx cdk synth
# ✅ SUCCESS - CloudFormation template generated successfully
```

### Test Status
```bash
npm test
# ✅ SUCCESS - All tests passed
```

### API Endpoints Configured
1. ✅ `POST /loads/{loadId}/book` → BookLoadLambda
2. ✅ `POST /negotiate` → NegotiateLambda
3. ✅ `POST /negotiations/{negotiationId}/broker-response` → BrokerResponseLambda
4. ✅ `GET /negotiations/{negotiationId}` → NegotiationStatusLambda

### Lambda Functions
1. ✅ BookLoadLambda
   - Runtime: Node.js 18
   - Timeout: 30 seconds
   - Memory: 512 MB
   - Environment: LOADS_TABLE_NAME, BOOKINGS_TABLE_NAME, DOCUMENTS_TABLE_NAME, DOCUMENTS_BUCKET_NAME

2. ✅ NegotiateLambda
   - Runtime: Node.js 18
   - Timeout: 60 seconds (for Bedrock calls)
   - Memory: 1024 MB (for Bedrock calls)
   - Environment: LOADS_TABLE_NAME, DRIVERS_TABLE_NAME, NEGOTIATIONS_TABLE_NAME, BEDROCK_MODEL_ID, N8N_WEBHOOK_URL

3. ✅ BrokerResponseLambda
   - Runtime: Node.js 18
   - Timeout: 60 seconds (for Bedrock calls)
   - Memory: 1024 MB (for Bedrock calls)
   - Environment: LOADS_TABLE_NAME, DRIVERS_TABLE_NAME, NEGOTIATIONS_TABLE_NAME, BOOKINGS_TABLE_NAME, DOCUMENTS_TABLE_NAME, DOCUMENTS_BUCKET_NAME, BEDROCK_MODEL_ID

4. ✅ NegotiationStatusLambda
   - Runtime: Node.js 18
   - Timeout: 30 seconds
   - Memory: 512 MB
   - Environment: NEGOTIATIONS_TABLE_NAME

### IAM Permissions
- ✅ Lambda execution role has permissions for:
  - DynamoDB read/write on all tables
  - S3 read/write on documents bucket
  - Bedrock InvokeModel for Claude 3 Haiku

## File Structure
```
backend/
├── lambda/
│   ├── shared/
│   │   ├── types.ts
│   │   ├── validation.ts
│   │   ├── response.ts
│   │   ├── dynamodb.ts
│   │   ├── s3.ts
│   │   ├── utils.ts
│   │   ├── index.ts
│   │   └── README.md
│   ├── load-search.ts
│   ├── load-detail.ts
│   ├── book-load.ts
│   ├── negotiate.ts
│   ├── broker-response.ts
│   └── negotiation-status.ts
├── lib/
│   └── feightly-backend-stack.ts
├── bin/
│   └── backend.ts
└── package.json
```

## API Examples

### Book Load
```bash
POST /loads/load-123/book
Content-Type: application/json

{
  "driverId": "driver-456"
}
```

Response:
```json
{
  "bookingId": "booking-789",
  "loadId": "load-123",
  "finalRate": 2.75,
  "rateConDocId": "doc-101",
  "status": "confirmed"
}
```

### Start Negotiation
```bash
POST /negotiate
Content-Type: application/json

{
  "loadId": "load-123",
  "driverId": "driver-456",
  "strategy": "moderate"
}
```

Response:
```json
{
  "negotiationId": "negotiation-789",
  "status": "in_progress",
  "initialOffer": {
    "round": 1,
    "amount": 2.80,
    "emailBody": "Dear Broker,\n\nI am interested in your load..."
  }
}
```

### Broker Response
```bash
POST /negotiations/negotiation-789/broker-response
Content-Type: application/json

{
  "brokerEmail": "broker@example.com",
  "emailBody": "We can offer $2.65/mile for this load.",
  "counterOffer": 2.65
}
```

Response (continuing negotiation):
```json
{
  "negotiationId": "negotiation-789",
  "status": "in_progress",
  "currentRound": 2,
  "latestOffer": {
    "round": 3,
    "amount": 2.75,
    "sender": "driver"
  }
}
```

Response (accepted):
```json
{
  "negotiationId": "negotiation-789",
  "status": "accepted",
  "currentRound": 2,
  "bookingId": "booking-890"
}
```

### Get Negotiation Status
```bash
GET /negotiations/negotiation-789
```

Response:
```json
{
  "negotiationId": "negotiation-789",
  "loadId": "load-123",
  "driverId": "driver-456",
  "brokerEmail": "broker@example.com",
  "driverMinRate": 2.75,
  "marketRate": 2.70,
  "postedRate": 2.60,
  "maxRounds": 5,
  "currentRound": 2,
  "strategy": "moderate",
  "status": "in_progress",
  "offers": [
    {
      "round": 1,
      "amount": 2.80,
      "sender": "driver",
      "timestamp": "2024-01-15T10:00:00Z",
      "emailBody": "..."
    },
    {
      "round": 2,
      "amount": 2.65,
      "sender": "broker",
      "timestamp": "2024-01-15T10:30:00Z",
      "emailBody": "..."
    }
  ],
  "n8nWebhookUrl": "https://webhook.n8n.example.com"
}
```

## Key Implementation Details

### Booking Flow
1. Validates load exists and is available
2. Uses DynamoDB transactions to ensure atomicity:
   - Updates load status with conditional check
   - Creates booking record
   - Creates document record
3. Generates and uploads rate confirmation to S3
4. Returns booking details with document ID

### Negotiation Flow
1. **Start Negotiation**:
   - Validates inputs and retrieves load/driver data
   - Calls Bedrock to generate initial offer email
   - Stores negotiation record with first offer
   - Sends email via n8n webhook

2. **Broker Response**:
   - Parses broker's counter-offer
   - Decision logic:
     - If offer >= driver minimum → Accept and create booking
     - If rounds < max → Generate counter-offer via Bedrock
     - If rounds >= max → Walk away
   - Updates negotiation record with all offers
   - Sends counter-offers via n8n webhook

3. **Status Check**:
   - Returns complete negotiation history
   - Includes all offers from both parties
   - Shows current status and round

### Error Handling
- ✅ 400 Bad Request: Invalid inputs, missing fields
- ✅ 404 Not Found: Load or negotiation not found
- ✅ 409 Conflict: Concurrent booking attempts
- ✅ 500 Internal Server Error: DynamoDB or S3 failures
- ✅ 503 Service Unavailable: Bedrock or n8n webhook failures

### Concurrency Safety
- Booking uses DynamoDB conditional writes to prevent double-booking
- Only one concurrent booking request can succeed
- Others receive 409 Conflict error

## Next Steps

Ready to proceed with:
- ✅ Task 11: Implement Driver Dashboard Lambda
- ✅ Task 12: Implement Driver Documents Lambda
- ✅ Task 13: Implement comprehensive error handling
- ✅ Task 14: Implement API response formatting standards
- ✅ Task 15: Configure Lambda environment variables
- ✅ Task 16: Create deployment documentation

## Notes

- Optional property-based tests (tasks 6.2, 6.3, 7.2, 7.3, 8.2, 8.3, 9.2) were skipped for faster MVP delivery
- All code follows TypeScript best practices
- Error handling is comprehensive with structured logging
- Bedrock integration uses Claude 3 Haiku for cost-effective AI generation
- n8n webhook URL is configurable via environment variable
- All Lambda functions have appropriate timeouts and memory allocations

## Deployment Ready

The booking and negotiation infrastructure is ready to deploy with:
```bash
cd backend
./deploy.ps1  # Windows
# or
./deploy.sh   # Linux/Mac
```

Before deployment, ensure:
1. AWS credentials are configured
2. N8N_WEBHOOK_URL environment variable is set (or update CDK stack)
3. Bedrock model access is enabled in your AWS account

This will:
1. Build TypeScript code
2. Bootstrap CDK (if needed)
3. Deploy all resources to AWS
4. Output API Gateway URL and resource names
