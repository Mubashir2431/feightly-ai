# Lambda Configuration Summary

This document summarizes the Lambda function configurations in the Feightly Backend Stack.

## Configuration Overview

All Lambda functions are configured with:
- **Runtime**: Node.js 18
- **IAM Role**: FeightlyLambdaExecutionRole (shared across all functions)
- **Code Location**: `backend/lambda/` directory

## Lambda Functions

### 1. Load Search Lambda
- **Handler**: `load-search.handler`
- **Timeout**: 30 seconds
- **Memory**: 512 MB
- **Environment Variables**:
  - `LOADS_TABLE_NAME`: Feightly-Loads
  - `DRIVERS_TABLE_NAME`: Feightly-Drivers
- **Description**: Search for available loads with filters

### 2. Load Detail Lambda
- **Handler**: `load-detail.handler`
- **Timeout**: 30 seconds
- **Memory**: 512 MB
- **Environment Variables**:
  - `LOADS_TABLE_NAME`: Feightly-Loads
- **Description**: Retrieve a single load by ID

### 3. Book Load Lambda
- **Handler**: `book-load.handler`
- **Timeout**: 30 seconds
- **Memory**: 512 MB
- **Environment Variables**:
  - `LOADS_TABLE_NAME`: Feightly-Loads
  - `BOOKINGS_TABLE_NAME`: Feightly-Bookings
  - `DOCUMENTS_TABLE_NAME`: Feightly-Documents
  - `DOCUMENTS_BUCKET_NAME`: feightly-documents-{account-id}
- **Description**: Book a load and generate rate confirmation

### 4. Negotiate Lambda
- **Handler**: `negotiate.handler`
- **Timeout**: 60 seconds (extended for Bedrock calls)
- **Memory**: 1024 MB (increased for Bedrock calls)
- **Environment Variables**:
  - `LOADS_TABLE_NAME`: Feightly-Loads
  - `DRIVERS_TABLE_NAME`: Feightly-Drivers
  - `NEGOTIATIONS_TABLE_NAME`: Feightly-Negotiations
  - `BEDROCK_MODEL_ID`: anthropic.claude-3-haiku-20240307-v1:0
  - `N8N_WEBHOOK_URL`: (from environment or default)
- **Description**: Start autonomous negotiation with broker

### 5. Broker Response Lambda
- **Handler**: `broker-response.handler`
- **Timeout**: 60 seconds (extended for Bedrock calls)
- **Memory**: 1024 MB (increased for Bedrock calls)
- **Environment Variables**:
  - `LOADS_TABLE_NAME`: Feightly-Loads
  - `DRIVERS_TABLE_NAME`: Feightly-Drivers
  - `NEGOTIATIONS_TABLE_NAME`: Feightly-Negotiations
  - `BOOKINGS_TABLE_NAME`: Feightly-Bookings
  - `DOCUMENTS_TABLE_NAME`: Feightly-Documents
  - `DOCUMENTS_BUCKET_NAME`: feightly-documents-{account-id}
  - `BEDROCK_MODEL_ID`: anthropic.claude-3-haiku-20240307-v1:0
  - `N8N_WEBHOOK_URL`: (from environment or default)
- **Description**: Handle broker responses in autonomous negotiation

### 6. Negotiation Status Lambda
- **Handler**: `negotiation-status.handler`
- **Timeout**: 30 seconds
- **Memory**: 512 MB
- **Environment Variables**:
  - `NEGOTIATIONS_TABLE_NAME`: Feightly-Negotiations
- **Description**: Retrieve negotiation status with all offers

### 7. Driver Dashboard Lambda
- **Handler**: `driver-dashboard.handler`
- **Timeout**: 30 seconds
- **Memory**: 512 MB
- **Environment Variables**:
  - `BOOKINGS_TABLE_NAME`: Feightly-Bookings
  - `LOADS_TABLE_NAME`: Feightly-Loads
- **Description**: Retrieve driver dashboard metrics

### 8. Driver Documents Lambda
- **Handler**: `driver-documents.handler`
- **Timeout**: 30 seconds
- **Memory**: 512 MB
- **Environment Variables**:
  - `DOCUMENTS_TABLE_NAME`: Feightly-Documents
  - `DOCUMENTS_BUCKET_NAME`: feightly-documents-{account-id}
- **Description**: Retrieve driver documents with presigned S3 URLs

## Configuration Rationale

### Timeout Settings
- **30 seconds**: Standard timeout for most Lambda functions performing DynamoDB operations
- **60 seconds**: Extended timeout for functions making Bedrock API calls (Negotiate, Broker Response)

### Memory Settings
- **512 MB**: Standard memory allocation for most Lambda functions
- **1024 MB**: Increased memory for functions making Bedrock API calls to handle larger payloads and faster processing

### Environment Variables
Each Lambda function receives only the environment variables it needs:
- Table names for DynamoDB access
- Bucket name for S3 operations
- Bedrock model ID for AI operations
- n8n webhook URL for email automation

## CDK Outputs

The stack exports the following outputs for reference:

- `LoadsTableName`: Feightly-Loads
- `DriversTableName`: Feightly-Drivers
- `NegotiationsTableName`: Feightly-Negotiations
- `DocumentsTableName`: Feightly-Documents
- `BookingsTableName`: Feightly-Bookings
- `DocumentsBucketName`: feightly-documents-{account-id}
- `LambdaExecutionRoleArn`: ARN of the shared execution role
- `ApiGatewayUrl`: The deployed API Gateway URL
- `ApiGatewayId`: The API Gateway REST API ID

## Deployment Notes

1. Set the `N8N_WEBHOOK_URL` environment variable before deployment:
   ```bash
   export N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/feightly
   ```

2. Deploy the stack:
   ```bash
   npx cdk deploy
   ```

3. After deployment, the outputs will show the actual resource names and URLs.

## Requirements Validation

This configuration satisfies the following requirements:

- **Requirement 6.8**: Lambda environment variables configured for table names, bucket name, Bedrock model ID, and n8n webhook URL
- **Requirement 6.10**: Lambda timeouts configured (30s for most, 60s for Bedrock calls) and memory configured (512 MB for most, 1024 MB for Bedrock calls)
- **CDK Outputs**: Added for API Gateway URL and all table names for easy reference

