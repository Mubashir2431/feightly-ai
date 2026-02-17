# Feightly.ai Backend Deployment Guide

## Quick Start

This guide walks you through deploying the Feightly.ai backend infrastructure to AWS.

## Prerequisites Checklist

Before you begin, ensure you have:

- [ ] AWS Account with admin or sufficient permissions
- [ ] AWS CLI installed and configured (`aws --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] AWS CDK installed globally (`cdk --version`)
- [ ] Project dependencies installed (`npm install` in backend directory)

## Step-by-Step Deployment

### Step 1: Configure AWS Credentials

```bash
aws configure
```

Provide:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `us-east-1`
- Default output format: `json`

Verify configuration:
```bash
aws sts get-caller-identity
```

You should see your account ID and user ARN.

### Step 2: Install Dependencies

```bash
cd backend
npm install
```

### Step 3: (Optional) Configure n8n Webhook

If you plan to use the negotiation feature:

**Linux/Mac:**
```bash
export N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/feightly
```

**Windows PowerShell:**
```powershell
$env:N8N_WEBHOOK_URL="https://your-n8n-instance.com/webhook/feightly"
```

You can skip this step and configure it later by updating the Lambda environment variables in the AWS Console.

### Step 4: Deploy Using Script (Recommended)

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

**Windows PowerShell:**
```powershell
.\deploy.ps1
```

The script will:
1. ✅ Verify AWS credentials
2. ✅ Build TypeScript code
3. ✅ Bootstrap CDK (if needed)
4. ✅ Synthesize CloudFormation template
5. ✅ Deploy to AWS
6. ✅ Display outputs

### Step 5: Save Deployment Outputs

After deployment completes, you'll see outputs like:

```
FeightlyBackendStack.ApiGatewayUrl = https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/
FeightlyBackendStack.LoadsTableName = Feightly-Loads
FeightlyBackendStack.DriversTableName = Feightly-Drivers
...
```

**Important:** Save the `ApiGatewayUrl` - you'll need it to configure your mobile app.

### Step 6: Test the Deployment

Test that the API is working:

```bash
# Replace with your actual API URL
API_URL="https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod"

# Test load search endpoint
curl "$API_URL/loads"
```

You should get a 200 response with an empty loads array (no data yet).

## Manual Deployment (Alternative)

If you prefer manual control:

### 1. Bootstrap CDK (First time only)

```bash
# Get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap CDK
npx cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

### 2. Build the Project

```bash
npm run build
```

### 3. Review Changes (Optional)

```bash
npx cdk diff
```

### 4. Deploy

```bash
npx cdk deploy
```

Type `y` when prompted to confirm changes.

## Post-Deployment Configuration

### Configure n8n Webhook (If Not Done Earlier)

1. Go to AWS Console → Lambda
2. Find `FeightlyBackendStack-NegotiateLambda`
3. Go to Configuration → Environment variables
4. Edit `N8N_WEBHOOK_URL` to your webhook URL
5. Repeat for `FeightlyBackendStack-BrokerResponseLambda`

### Set Up CloudWatch Alarms (Recommended)

1. Go to AWS Console → CloudWatch → Alarms
2. Create alarms for:
   - Lambda errors > 5%
   - API Gateway 5xx errors > threshold
   - DynamoDB throttled requests > 0

### Configure API Authentication (Production)

For production, add authentication:

**Option 1: API Keys**
1. Go to API Gateway console
2. Select Feightly API
3. Create API key
4. Create usage plan
5. Associate API key with usage plan

**Option 2: AWS Cognito**
1. Create Cognito User Pool
2. Update API Gateway to use Cognito authorizer
3. Update mobile app to authenticate users

## Updating the Deployment

When you make changes to Lambda functions or infrastructure:

```bash
# Build changes
npm run build

# Review changes
npx cdk diff

# Deploy updates
npx cdk deploy
```

Or use the deployment script:
```bash
./deploy.sh  # Linux/Mac
.\deploy.ps1  # Windows
```

## Rollback

If something goes wrong, rollback to previous version:

```bash
# Via CloudFormation console
# 1. Go to CloudFormation
# 2. Select FeightlyBackendStack
# 3. Click "Stack actions" → "Roll back"

# Or destroy and redeploy
npx cdk destroy
npx cdk deploy
```

## Cleanup (Remove All Resources)

To completely remove all AWS resources:

```bash
npx cdk destroy
```

**Warning:** This will delete:
- All DynamoDB tables and data
- S3 bucket and all documents
- All Lambda functions
- API Gateway
- IAM roles

Type `y` to confirm deletion.

## Troubleshooting

### "Unable to resolve AWS account"

**Problem:** CDK can't determine your AWS account.

**Solution:**
```bash
aws configure
aws sts get-caller-identity
```

### "Stack already exists"

**Problem:** Previous deployment failed partway through.

**Solution:**
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name FeightlyBackendStack

# If in failed state, delete and retry
npx cdk destroy
npx cdk deploy
```

### "Insufficient permissions"

**Problem:** Your AWS user lacks required permissions.

**Solution:** Your AWS user needs these permissions:
- CloudFormation: Full access
- DynamoDB: CreateTable, DeleteTable
- Lambda: CreateFunction, DeleteFunction
- API Gateway: CreateRestApi, DeleteRestApi
- S3: CreateBucket, DeleteBucket
- IAM: CreateRole, AttachRolePolicy

Contact your AWS administrator to grant these permissions.

### "Bootstrap stack not found"

**Problem:** CDK not bootstrapped in your account/region.

**Solution:**
```bash
npx cdk bootstrap
```

### Build Errors

**Problem:** TypeScript compilation fails.

**Solution:**
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Lambda Function Errors After Deployment

**Problem:** Lambda functions return errors.

**Solution:**
```bash
# View logs
aws logs tail /aws/lambda/FeightlyBackendStack-LoadSearchLambda --follow

# Check environment variables
aws lambda get-function-configuration --function-name FeightlyBackendStack-LoadSearchLambda
```

## Cost Monitoring

Monitor your AWS costs:

1. Go to AWS Console → Billing Dashboard
2. Enable Cost Explorer
3. Set up billing alerts:
   - Go to Billing → Billing preferences
   - Enable "Receive Billing Alerts"
   - Create CloudWatch alarm for estimated charges

Expected costs for development:
- DynamoDB: ~$0-5/month (pay-per-request)
- Lambda: ~$0-5/month (free tier)
- S3: ~$0-1/month
- API Gateway: ~$0-5/month
- Bedrock: ~$0-10/month (depends on usage)

**Total: ~$0-25/month for development**

## Next Steps

After successful deployment:

1. ✅ Test all API endpoints (see API_DOCUMENTATION.md)
2. ✅ Configure n8n webhook for negotiation feature
3. ✅ Set up CloudWatch alarms
4. ✅ Integrate API URL with mobile app
5. ✅ Add sample data to DynamoDB for testing
6. ✅ Configure API authentication for production
7. ✅ Set up CI/CD pipeline (optional)

## Support Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)

## Getting Help

If you encounter issues:

1. Check CloudWatch Logs for detailed error messages
2. Review this troubleshooting section
3. Check AWS Service Health Dashboard
4. Review CDK and Lambda documentation
5. Search Stack Overflow with relevant error messages

Include the following in support requests:
- Error message and stack trace
- CloudFormation stack status
- Lambda function logs (from CloudWatch)
- Request ID from API responses
- Steps to reproduce the issue
