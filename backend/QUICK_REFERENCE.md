# Feightly.ai Backend Quick Reference

## Essential Commands

### Deployment
```bash
# Automated deployment (recommended)
./deploy.sh              # Linux/Mac
.\deploy.ps1             # Windows

# Manual deployment
npm run build            # Build TypeScript
npx cdk synth           # Generate CloudFormation
npx cdk deploy          # Deploy to AWS
```

### Development
```bash
npm run build           # Compile TypeScript
npm run watch           # Watch mode (auto-compile)
npm run test            # Run tests
npx cdk diff            # Preview changes
```

### Cleanup
```bash
npx cdk destroy         # Remove all AWS resources
```

## API Endpoints

Base URL: `https://{api-id}.execute-api.us-east-1.amazonaws.com/prod/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/loads` | Search loads |
| GET | `/loads/{loadId}` | Get load details |
| POST | `/loads/{loadId}/book` | Book a load |
| POST | `/negotiate` | Start negotiation |
| GET | `/negotiations/{negotiationId}` | Get negotiation status |
| POST | `/negotiations/{negotiationId}/broker-response` | Handle broker response |
| GET | `/driver/{driverId}/dashboard` | Get driver metrics |
| GET | `/driver/{driverId}/documents` | Get driver documents |

## AWS Resources Created

- **5 DynamoDB Tables**: Loads, Drivers, Negotiations, Documents, Bookings
- **1 S3 Bucket**: feightly-documents-{account-id}
- **8 Lambda Functions**: Load search, detail, booking, negotiation, etc.
- **1 API Gateway**: REST API with 8 endpoints
- **1 IAM Role**: Lambda execution role with DynamoDB, S3, Bedrock permissions

## Environment Variables

Set before deployment (optional):
```bash
export N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/feightly
```

Auto-configured by CDK:
- `LOADS_TABLE_NAME`
- `DRIVERS_TABLE_NAME`
- `NEGOTIATIONS_TABLE_NAME`
- `DOCUMENTS_TABLE_NAME`
- `BOOKINGS_TABLE_NAME`
- `DOCUMENTS_BUCKET_NAME`
- `BEDROCK_MODEL_ID`

## Common Tasks

### View Lambda Logs
```bash
aws logs tail /aws/lambda/FeightlyBackendStack-LoadSearchLambda --follow
```

### Test API Endpoint
```bash
curl "https://your-api-url/prod/loads"
```

### Update Lambda Environment Variable
```bash
aws lambda update-function-configuration \
  --function-name FeightlyBackendStack-NegotiateLambda \
  --environment Variables={N8N_WEBHOOK_URL=https://new-url.com}
```

### Get Stack Outputs
```bash
aws cloudformation describe-stacks \
  --stack-name FeightlyBackendStack \
  --query 'Stacks[0].Outputs'
```

## Troubleshooting

### Check AWS Credentials
```bash
aws sts get-caller-identity
```

### Check Stack Status
```bash
aws cloudformation describe-stacks --stack-name FeightlyBackendStack
```

### View CloudFormation Events
```bash
aws cloudformation describe-stack-events --stack-name FeightlyBackendStack
```

### Check Lambda Function
```bash
aws lambda get-function --function-name FeightlyBackendStack-LoadSearchLambda
```

## Cost Estimates

**Development/Testing:**
- ~$0-25/month with minimal usage
- Most services have free tier coverage

**Production (Moderate Usage):**
- ~$80-315/month depending on traffic
- Monitor with AWS Cost Explorer

## Documentation Files

- `README.md` - Overview and setup
- `DEPLOYMENT_GUIDE.md` - Step-by-step deployment
- `API_DOCUMENTATION.md` - Complete API reference
- `INFRASTRUCTURE.md` - Infrastructure details
- `QUICK_REFERENCE.md` - This file

## Support Resources

- [AWS CDK Docs](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Docs](https://docs.aws.amazon.com/lambda/)
- [API Gateway Docs](https://docs.aws.amazon.com/apigateway/)
- [DynamoDB Docs](https://docs.aws.amazon.com/dynamodb/)
- [Bedrock Docs](https://docs.aws.amazon.com/bedrock/)

## Emergency Contacts

For production issues:
1. Check CloudWatch Logs
2. Review CloudFormation events
3. Check AWS Service Health Dashboard
4. Contact AWS Support (if you have a support plan)
