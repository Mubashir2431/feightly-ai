# Feightly.ai Backend Infrastructure

This directory contains the AWS CDK infrastructure code for the feightly.ai backend.

## Architecture

The backend uses a serverless architecture with:
- **AWS DynamoDB**: 5 tables (Loads, Drivers, Negotiations, Documents, Bookings)
- **AWS Lambda**: 8 Node.js 18 functions for business logic
- **AWS API Gateway**: REST API with 8 endpoints
- **AWS S3**: Document storage with presigned URLs
- **Amazon Bedrock**: Claude 3 Haiku for AI-powered negotiation emails

## Prerequisites

1. **AWS Account**: You need an AWS account with appropriate permissions to create:
   - DynamoDB tables
   - Lambda functions
   - API Gateway REST APIs
   - S3 buckets
   - IAM roles and policies
   - CloudWatch Logs

2. **AWS CLI**: Install and configure AWS CLI with your credentials
   ```bash
   aws configure
   ```
   You'll need to provide:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Default region (use `us-east-1`)
   - Default output format (use `json`)

3. **Node.js**: Version 18 or higher
   - Download from https://nodejs.org/
   - Verify installation: `node --version`

4. **AWS CDK**: Installed globally
   ```bash
   npm install -g aws-cdk
   ```
   - Verify installation: `cdk --version`

5. **Project Dependencies**: Install from the backend directory
   ```bash
   cd backend
   npm install
   ```

## Project Structure

```
backend/
├── bin/
│   └── backend.ts              # CDK app entry point
├── lib/
│   └── feightly-backend-stack.ts  # Main infrastructure stack
├── lambda/                     # Lambda function code
│   ├── load-search.ts         # Search loads endpoint
│   ├── load-detail.ts         # Load details endpoint
│   ├── book-load.ts           # Book load endpoint
│   ├── negotiate.ts           # Start negotiation endpoint
│   ├── broker-response.ts     # Handle broker response endpoint
│   ├── negotiation-status.ts  # Get negotiation status endpoint
│   ├── driver-dashboard.ts    # Driver metrics endpoint
│   ├── driver-documents.ts    # Driver documents endpoint
│   └── shared/                # Shared utilities
│       ├── dynamodb.ts        # DynamoDB helpers
│       ├── s3.ts              # S3 helpers
│       ├── response.ts        # Response formatters
│       ├── validation.ts      # Input validation
│       ├── types.ts           # TypeScript interfaces
│       └── utils.ts           # Utility functions
├── test/                      # CDK tests
├── cdk.json                   # CDK configuration
├── package.json               # Node.js dependencies
├── tsconfig.json              # TypeScript configuration
├── deploy.sh                  # Linux/Mac deployment script
├── deploy.ps1                 # Windows deployment script
├── .env.example               # Environment variables template
├── README.md                  # This file
├── DEPLOYMENT_GUIDE.md        # Deployment instructions
├── API_DOCUMENTATION.md       # API reference
├── INFRASTRUCTURE.md          # Infrastructure details
├── QUICK_REFERENCE.md         # Command cheat sheet
└── LAMBDA-CONFIG-SUMMARY.md   # Lambda configuration
```

## Infrastructure Components

### DynamoDB Tables

1. **Feightly-Loads**: Stores freight load opportunities
   - Partition Key: `loadId` (String)
   
2. **Feightly-Drivers**: Stores driver profiles and preferences
   - Partition Key: `driverId` (String)
   
3. **Feightly-Negotiations**: Stores negotiation records and offer history
   - Partition Key: `negotiationId` (String)
   
4. **Feightly-Documents**: Stores document metadata
   - Partition Key: `docId` (String)
   
5. **Feightly-Bookings**: Stores confirmed load bookings
   - Partition Key: `bookingId` (String)

### S3 Bucket

- **feightly-documents-{account-id}**: Stores rate confirmations, BOLs, PODs, and invoices

### IAM Role

- **FeightlyLambdaExecutionRole**: Execution role for all Lambda functions with permissions for:
  - DynamoDB read/write access
  - S3 read/write access
  - Amazon Bedrock model invocation
  - CloudWatch Logs

## Environment Variables

The following environment variables are automatically configured for Lambda functions during deployment:

### DynamoDB Table Names
- `LOADS_TABLE_NAME`: Feightly-Loads
- `DRIVERS_TABLE_NAME`: Feightly-Drivers
- `NEGOTIATIONS_TABLE_NAME`: Feightly-Negotiations
- `DOCUMENTS_TABLE_NAME`: Feightly-Documents
- `BOOKINGS_TABLE_NAME`: Feightly-Bookings

### S3 Configuration
- `DOCUMENTS_BUCKET_NAME`: feightly-documents-{account-id}

### Amazon Bedrock Configuration
- `BEDROCK_MODEL_ID`: anthropic.claude-3-haiku-20240307-v1:0

### External Integration
- `N8N_WEBHOOK_URL`: (must be configured before deployment)
  - Set this environment variable before deploying:
    ```bash
    # Linux/Mac
    export N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/feightly
    
    # Windows PowerShell
    $env:N8N_WEBHOOK_URL="https://your-n8n-instance.com/webhook/feightly"
    ```
  - Or update the CDK stack after deployment to change the webhook URL

### AWS Region
- `AWS_REGION`: us-east-1 (configured automatically)

## Deployment

### Quick Start (Automated)

Use the provided deployment scripts for automated deployment:

**Linux/Mac:**
```bash
cd backend
chmod +x deploy.sh
./deploy.sh
```

**Windows PowerShell:**
```powershell
cd backend
.\deploy.ps1
```

The scripts will:
1. Verify AWS credentials
2. Build the TypeScript code
3. Bootstrap CDK (if needed)
4. Synthesize CloudFormation template
5. Deploy the stack to AWS
6. Display stack outputs

### Manual Deployment (Step-by-Step)

#### 1. Bootstrap CDK (First time only)

If this is your first time using CDK in your AWS account/region:

```bash
cd backend
npx cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

Replace `ACCOUNT-ID` with your AWS account ID (get it with `aws sts get-caller-identity --query Account --output text`).

#### 2. Configure n8n Webhook URL (Optional)

If you're using the negotiation feature, set the n8n webhook URL:

```bash
# Linux/Mac
export N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/feightly

# Windows PowerShell
$env:N8N_WEBHOOK_URL="https://your-n8n-instance.com/webhook/feightly"
```

#### 3. Build the project

```bash
npm run build
```

This compiles TypeScript to JavaScript for both CDK infrastructure and Lambda functions.

#### 4. Synthesize CloudFormation template (Optional)

```bash
npx cdk synth
```

This generates the CloudFormation template without deploying. Review the template in `cdk.out/`.

#### 5. Review changes (Optional)

```bash
npx cdk diff
```

This shows what changes will be made to your AWS account.

#### 6. Deploy the stack

```bash
npx cdk deploy
```

Review the changes and confirm when prompted. The deployment will:
- Create all 5 DynamoDB tables
- Create the S3 bucket for documents
- Create the IAM execution role
- Create 8 Lambda functions
- Create API Gateway REST API with 8 endpoints
- Configure CORS and request validation
- Output resource names and API Gateway URL

Deployment typically takes 2-5 minutes.

#### 7. View outputs

After deployment, you'll see outputs like:

```
FeightlyBackendStack.ApiGatewayUrl = https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/
FeightlyBackendStack.LoadsTableName = Feightly-Loads
FeightlyBackendStack.DriversTableName = Feightly-Drivers
FeightlyBackendStack.NegotiationsTableName = Feightly-Negotiations
FeightlyBackendStack.DocumentsTableName = Feightly-Documents
FeightlyBackendStack.BookingsTableName = Feightly-Bookings
FeightlyBackendStack.DocumentsBucketName = feightly-documents-123456789012
FeightlyBackendStack.LambdaExecutionRoleArn = arn:aws:iam::123456789012:role/FeightlyLambdaExecutionRole
```

**Save the API Gateway URL** - you'll need it to configure your mobile app.

## Useful CDK Commands

- `npm run build`: Compile TypeScript to JavaScript
- `npm run watch`: Watch for changes and compile automatically
- `npm run test`: Run Jest unit tests for CDK infrastructure
- `npx cdk diff`: Compare deployed stack with current state
- `npx cdk synth`: Emit the synthesized CloudFormation template
- `npx cdk deploy`: Deploy this stack to your AWS account
- `npx cdk destroy`: Remove all resources (⚠️ use with caution!)
- `npx cdk ls`: List all stacks in the app
- `npx cdk docs`: Open CDK documentation

## API Endpoints

After deployment, your API Gateway will expose the following endpoints:

### Base URL
```
https://{api-id}.execute-api.us-east-1.amazonaws.com/prod/
```

### Endpoints

1. **GET /loads** - Search for available loads
2. **GET /loads/{loadId}** - Get load details
3. **POST /loads/{loadId}/book** - Book a load
4. **POST /negotiate** - Start negotiation
5. **GET /negotiations/{negotiationId}** - Get negotiation status
6. **POST /negotiations/{negotiationId}/broker-response** - Handle broker response
7. **GET /driver/{driverId}/dashboard** - Get driver dashboard metrics
8. **GET /driver/{driverId}/documents** - Get driver documents

For detailed API documentation including request/response formats, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

## Development Workflow

1. Make changes to the infrastructure code in `lib/feightly-backend-stack.ts`
2. Build the project: `npm run build`
3. Review changes: `npx cdk diff`
4. Deploy changes: `npx cdk deploy`

## Cost Considerations

- **DynamoDB**: Pay-per-request billing (no cost when idle)
- **S3**: Storage costs based on usage
- **Lambda**: Pay per invocation and execution time
- **API Gateway**: Pay per API call
- **Bedrock**: Pay per token (input + output)

For development/testing, costs should be minimal. Monitor your AWS billing dashboard.

## Security Notes

- All DynamoDB tables use encryption at rest (default)
- S3 bucket blocks all public access
- S3 bucket uses server-side encryption
- IAM role follows least-privilege principle
- CORS is configured for S3 (restrict origins in production)

## Next Steps

1. ✅ Infrastructure setup complete
2. ✅ Lambda functions implemented
3. ✅ API Gateway endpoints configured
4. ⏭️ Test API endpoints with sample data
5. ⏭️ Configure n8n webhook integration for negotiation emails
6. ⏭️ Integrate API with Expo mobile app
7. ⏭️ Add monitoring and CloudWatch alarms
8. ⏭️ Set up CI/CD pipeline
9. ⏭️ Configure API authentication (Cognito or API keys)
10. ⏭️ Production hardening (adjust removal policies, add backups)

## Testing the API

After deployment, test the API endpoints:

```bash
# Get the API URL from deployment outputs
API_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com/prod"

# Test load search
curl "$API_URL/loads?equipment=Dry%20Van&minRate=2.5"

# Test load detail
curl "$API_URL/loads/load-123"

# Test booking
curl -X POST "$API_URL/loads/load-123/book" \
  -H "Content-Type: application/json" \
  -d '{"driverId":"driver-456"}'
```

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference with all endpoints and examples.

## Troubleshooting

### CDK Bootstrap Error

If you get a bootstrap error:
```bash
npx cdk bootstrap
```

Or specify your account and region explicitly:
```bash
npx cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

### Permission Denied

Ensure your AWS CLI is configured with credentials that have sufficient permissions:
```bash
aws sts get-caller-identity
```

Required permissions:
- DynamoDB: CreateTable, DescribeTable, DeleteTable
- Lambda: CreateFunction, UpdateFunctionCode, DeleteFunction
- API Gateway: CreateRestApi, CreateResource, CreateMethod
- S3: CreateBucket, PutBucketPolicy, DeleteBucket
- IAM: CreateRole, AttachRolePolicy, DeleteRole
- CloudFormation: CreateStack, UpdateStack, DeleteStack

### Region Mismatch

The stack is configured for `us-east-1`. To change regions:
1. Update `backend/bin/backend.ts`
2. Update your AWS CLI default region: `aws configure set region YOUR-REGION`
3. Re-bootstrap CDK in the new region

### Build Errors

If you encounter TypeScript compilation errors:
```bash
npm install
npm run build
```

Check that you have Node.js 18+ installed:
```bash
node --version
```

### Deployment Fails

If deployment fails partway through:
1. Check CloudFormation console for detailed error messages
2. Fix the issue
3. Re-run `npx cdk deploy`

CDK will automatically resume from where it failed.

### Lambda Function Errors

To view Lambda function logs:
```bash
aws logs tail /aws/lambda/FeightlyBackendStack-LoadSearchLambda --follow
```

Or use the AWS Console → CloudWatch → Log Groups

### API Gateway 403 Errors

If you get 403 Forbidden errors:
1. Check that CORS is configured correctly
2. Verify the API Gateway deployment stage is `prod`
3. Check Lambda execution role permissions

### Clean Up Failed Deployment

If you need to completely remove a failed deployment:
```bash
npx cdk destroy
```

Then redeploy:
```bash
npx cdk deploy
```

## Documentation

This backend includes comprehensive documentation:

- **[README.md](./README.md)** (this file) - Overview and quick reference
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Command cheat sheet and quick lookup
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Step-by-step deployment instructions
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete API reference with examples
- **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** - Infrastructure details and data schemas
- **[LAMBDA-CONFIG-SUMMARY.md](./LAMBDA-CONFIG-SUMMARY.md)** - Lambda configuration reference
- **[CHECKPOINT-1.md](./CHECKPOINT-1.md)** - Load search and retrieval implementation notes
- **[CHECKPOINT-2.md](./CHECKPOINT-2.md)** - Booking and negotiation implementation notes

## Support

For issues or questions, refer to:
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
