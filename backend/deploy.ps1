# Feightly.ai Backend Deployment Script (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "Starting Feightly.ai Backend Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if AWS CLI is configured
Write-Host "Checking AWS credentials..." -ForegroundColor Cyan
try {
    $null = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI not configured"
    }
} catch {
    Write-Host "Error: AWS CLI is not configured or credentials are invalid" -ForegroundColor Red
    Write-Host "Please run 'aws configure' to set up your credentials" -ForegroundColor Yellow
    exit 1
}

Write-Host "AWS credentials verified" -ForegroundColor Green

# Get AWS account ID and region
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$REGION = "us-east-1"

Write-Host "Deployment Details:" -ForegroundColor Cyan
Write-Host "   Account ID: $ACCOUNT_ID"
Write-Host "   Region: $REGION"
Write-Host ""

# Build the project
Write-Host "Building TypeScript code..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "Build successful" -ForegroundColor Green
Write-Host ""

# Check if CDK is bootstrapped
Write-Host "Checking CDK bootstrap status..." -ForegroundColor Cyan
$bootstrapped = $false
try {
    $null = aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION 2>&1
    if ($LASTEXITCODE -eq 0) {
        $bootstrapped = $true
    }
} catch {
    $bootstrapped = $false
}

if ($bootstrapped) {
    Write-Host "CDK already bootstrapped" -ForegroundColor Green
} else {
    Write-Host "CDK is not bootstrapped in this account/region" -ForegroundColor Yellow
    Write-Host "Bootstrapping CDK..." -ForegroundColor Cyan
    npx cdk bootstrap "aws://$ACCOUNT_ID/$REGION"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Bootstrap failed" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Bootstrap successful" -ForegroundColor Green
}

Write-Host ""

# Synthesize CloudFormation template
Write-Host "Synthesizing CloudFormation template..." -ForegroundColor Cyan
npx cdk synth

if ($LASTEXITCODE -ne 0) {
    Write-Host "Synthesis failed" -ForegroundColor Red
    exit 1
}

Write-Host "Synthesis successful" -ForegroundColor Green
Write-Host ""

# Deploy the stack
Write-Host "Deploying stack to AWS..." -ForegroundColor Cyan
Write-Host "This may take a few minutes..." -ForegroundColor Yellow
npx cdk deploy --require-approval never

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Stack Outputs:" -ForegroundColor Cyan
aws cloudformation describe-stacks --stack-name FeightlyBackendStack --region $REGION --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table

Write-Host ""
Write-Host "Your Feightly.ai backend infrastructure is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Save the API Gateway URL from the outputs above"
Write-Host "  2. Test the endpoints using the API_DOCUMENTATION.md"
Write-Host "  3. Configure n8n webhook URL if using negotiation feature"
Write-Host ""
