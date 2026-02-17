# Feightly.ai Infrastructure Overview

## Created Resources

### DynamoDB Tables (5)

1. **Feightly-Loads**
   - Partition Key: `loadId` (String)
   - Billing: Pay-per-request
   - Purpose: Store freight load opportunities with origin, destination, rates, broker info, and status

2. **Feightly-Drivers**
   - Partition Key: `driverId` (String)
   - Billing: Pay-per-request
   - Purpose: Store driver profiles, preferences, home base, and current location

3. **Feightly-Negotiations**
   - Partition Key: `negotiationId` (String)
   - Billing: Pay-per-request
   - Purpose: Store negotiation records with offer history and AI-generated emails

4. **Feightly-Documents**
   - Partition Key: `docId` (String)
   - Billing: Pay-per-request
   - Purpose: Store document metadata (rate confirmations, BOLs, PODs, invoices)

5. **Feightly-Bookings**
   - Partition Key: `bookingId` (String)
   - Billing: Pay-per-request
   - Purpose: Store confirmed load bookings with final rates and status

### S3 Bucket

- **feightly-documents-{account-id}**
  - Encryption: S3-managed (AES256)
  - Public Access: Blocked
  - CORS: Enabled for GET, PUT, POST
  - Purpose: Store actual document files (PDFs, images)

### IAM Role

- **FeightlyLambdaExecutionRole**
  - Permissions:
    - Full read/write access to all 5 DynamoDB tables
    - Full read/write access to S3 documents bucket
    - Invoke Amazon Bedrock (Claude 3 Haiku model)
    - CloudWatch Logs (via AWSLambdaBasicExecutionRole)

## Infrastructure as Code

All resources are defined in `lib/feightly-backend-stack.ts` using AWS CDK with TypeScript.

### Key Features

- **Serverless**: No servers to manage, scales automatically
- **Pay-per-use**: Only pay for what you use
- **Secure**: Encryption at rest, IAM-based access control
- **Repeatable**: Infrastructure defined as code, version controlled
- **Region**: us-east-1 (configurable in `bin/backend.ts`)

## Data Schema

### Load Schema
```typescript
{
  loadId: string;
  origin: {
    city: string;
    state: string;
    lat: number;
    lng: number;
    address: string;
  };
  destination: {
    city: string;
    state: string;
    lat: number;
    lng: number;
    address: string;
  };
  distanceMiles: number;
  equipment: 'Dry Van' | 'Reefer' | 'Flatbed';
  weightLbs: number;
  postedRate: number;
  marketRateAvg: number;
  marketRateHigh: number;
  marketRateLow: number;
  rateTrend: 'rising' | 'falling' | 'stable';
  bookingType: 'book_now' | 'negotiable' | 'hot';
  bookNowRate?: number;
  broker: {
    name: string;
    contact: string;
    email: string;
    phone: string;
    rating: number;
    paymentTerms: string;
    onTimePayment: number;
  };
  pickupWindow: string;
  deliveryDeadline: string;
  status: 'available' | 'booked' | 'in_negotiation';
}
```

### Driver Schema
```typescript
{
  driverId: string;
  name: string;
  homeBase: {
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  currentLocation: {
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  equipment: string;
  preferredLanes: string[];
  avoidRegions: string[];
  minRate: number;
}
```

### Negotiation Schema
```typescript
{
  negotiationId: string;
  loadId: string;
  driverId: string;
  brokerEmail: string;
  driverMinRate: number;
  marketRate: number;
  postedRate: number;
  maxRounds: number;
  currentRound: number;
  strategy: 'aggressive' | 'moderate' | 'conservative';
  status: 'in_progress' | 'accepted' | 'rejected' | 'walked_away';
  offers: Array<{
    round: number;
    amount: number;
    sender: 'driver' | 'broker';
    timestamp: string;
    emailBody: string;
  }>;
  n8nWebhookUrl: string;
}
```

### Document Schema
```typescript
{
  docId: string;
  loadId: string;
  driverId: string;
  docType: 'rate_confirmation' | 'bol' | 'pod' | 'invoice';
  s3Key: string;
  createdAt: string;
}
```

### Booking Schema
```typescript
{
  bookingId: string;
  loadId: string;
  driverId: string;
  finalRate: number;
  status: 'confirmed' | 'in_transit' | 'delivered';
  bookedAt: string;
  rateConDocId: string;
}
```

## Access Patterns

### DynamoDB Operations

1. **Get load by ID**: `GetItem` on Loads table with `loadId`
2. **Search loads**: `Scan` on Loads table with filter expressions
3. **Get driver by ID**: `GetItem` on Drivers table with `driverId`
4. **Get negotiation by ID**: `GetItem` on Negotiations table with `negotiationId`
5. **Get bookings by driver**: `Scan` on Bookings table with filter on `driverId`
6. **Get documents by driver**: `Scan` on Documents table with filter on `driverId`
7. **Update load status**: `UpdateItem` on Loads table
8. **Create booking**: `PutItem` on Bookings table
9. **Update negotiation**: `UpdateItem` on Negotiations table

### S3 Operations

1. **Upload document**: `PutObject` to documents bucket
2. **Download document**: `GetObject` from documents bucket
3. **Generate presigned URL**: For secure temporary access

### Bedrock Operations

1. **Generate negotiation email**: `InvokeModel` with Claude 3 Haiku
2. **Generate counter-offer**: `InvokeModel` with negotiation context

## Security

### Encryption
- DynamoDB: Encryption at rest (AWS managed)
- S3: Server-side encryption (AES256)
- In-transit: HTTPS/TLS for all API calls

### Access Control
- IAM role-based access for Lambda functions
- S3 bucket blocks all public access
- DynamoDB tables not publicly accessible
- API Gateway will use IAM or Cognito auth (to be implemented)

### Best Practices
- Least privilege IAM policies
- No hardcoded credentials
- Environment variables for configuration
- CloudWatch Logs for audit trail

## Cost Estimation (Monthly)

### Development/Testing (Low Usage)
- DynamoDB: ~$0-5 (pay-per-request, minimal usage)
- S3: ~$0-1 (minimal storage)
- Lambda: ~$0-5 (free tier covers most dev usage)
- Bedrock: ~$0-10 (depends on negotiation volume)
- **Total: ~$0-20/month**

### Production (Moderate Usage)
- DynamoDB: ~$10-50 (depends on read/write volume)
- S3: ~$5-20 (depends on document storage)
- Lambda: ~$10-30 (depends on invocations)
- Bedrock: ~$50-200 (depends on negotiation volume)
- API Gateway: ~$5-15 (depends on API calls)
- **Total: ~$80-315/month**

*Note: Actual costs depend on usage patterns. Monitor AWS Cost Explorer.*

## Monitoring

### CloudWatch Metrics (Auto-enabled)
- DynamoDB: Read/write capacity, throttles, errors
- Lambda: Invocations, duration, errors, throttles
- S3: Bucket size, request count
- API Gateway: Request count, latency, errors

### CloudWatch Logs
- Lambda function logs (via AWSLambdaBasicExecutionRole)
- API Gateway access logs (to be configured)

### Recommended Alarms
1. Lambda error rate > 5%
2. DynamoDB throttled requests > 0
3. S3 4xx/5xx errors > threshold
4. API Gateway 5xx errors > threshold

## Next Steps

1. ✅ Infrastructure setup complete
2. ⏭️ Implement Lambda functions in `lambda/` directory
3. ⏭️ Set up API Gateway REST API
4. ⏭️ Configure n8n webhook integration
5. ⏭️ Add CloudWatch alarms and dashboards
6. ⏭️ Set up CI/CD pipeline
7. ⏭️ Configure API authentication (Cognito or API keys)
8. ⏭️ Add monitoring and logging
9. ⏭️ Performance testing and optimization
10. ⏭️ Production hardening (remove auto-delete, adjust removal policies)

## Deployment Commands

```bash
# Build
npm run build

# Synthesize CloudFormation
npx cdk synth

# Deploy to AWS
npx cdk deploy

# Or use the deployment script
./deploy.sh        # Linux/Mac
./deploy.ps1       # Windows PowerShell

# Destroy all resources (careful!)
npx cdk destroy
```

## Troubleshooting

### Common Issues

1. **Bootstrap Error**: Run `npx cdk bootstrap`
2. **Permission Denied**: Check AWS credentials with `aws sts get-caller-identity`
3. **Region Mismatch**: Verify region in `bin/backend.ts` matches your AWS CLI default
4. **Table Already Exists**: Change table names or destroy existing stack

### Getting Help

- AWS CDK Docs: https://docs.aws.amazon.com/cdk/
- AWS Support: https://console.aws.amazon.com/support/
- Stack Overflow: Tag questions with `aws-cdk`
