#!/bin/bash

# Feightly.ai Backend Deployment Script

set -e

echo "🚀 Starting Feightly.ai Backend Deployment"
echo "=========================================="

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ Error: AWS CLI is not configured or credentials are invalid"
    echo "Please run 'aws configure' to set up your credentials"
    exit 1
fi

echo "✅ AWS credentials verified"

# Get AWS account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"

echo "📋 Deployment Details:"
echo "   Account ID: $ACCOUNT_ID"
echo "   Region: $REGION"
echo ""

# Build the project
echo "🔨 Building TypeScript code..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Check if CDK is bootstrapped
echo "🔍 Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION &> /dev/null; then
    echo "⚠️  CDK is not bootstrapped in this account/region"
    echo "🔧 Bootstrapping CDK..."
    npx cdk bootstrap aws://$ACCOUNT_ID/$REGION
    
    if [ $? -ne 0 ]; then
        echo "❌ Bootstrap failed"
        exit 1
    fi
    
    echo "✅ Bootstrap successful"
else
    echo "✅ CDK already bootstrapped"
fi

echo ""

# Synthesize CloudFormation template
echo "📝 Synthesizing CloudFormation template..."
npx cdk synth

if [ $? -ne 0 ]; then
    echo "❌ Synthesis failed"
    exit 1
fi

echo "✅ Synthesis successful"
echo ""

# Deploy the stack
echo "🚀 Deploying stack to AWS..."
echo "⏳ This may take a few minutes..."
npx cdk deploy --require-approval never

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "📊 Stack Outputs:"
aws cloudformation describe-stacks \
    --stack-name FeightlyBackendStack \
    --region $REGION \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table

echo ""
echo "🎉 Your Feightly.ai backend infrastructure is ready!"
echo ""
echo "Next steps:"
echo "  1. Implement Lambda functions in the lambda/ directory"
echo "  2. Set up API Gateway endpoints"
echo "  3. Configure n8n webhook integration"
echo ""
