# Prepare Lambda deployment package with dependencies

Write-Host "Preparing Lambda deployment package..." -ForegroundColor Cyan

Set-Location lambda

# Create package.json if it doesn't exist
if (-not (Test-Path "package.json")) {
    Write-Host "Creating package.json..." -ForegroundColor Yellow
    @"
{
  "name": "feightly-lambda",
  "version": "1.0.0",
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.990.0",
    "@aws-sdk/client-dynamodb": "^3.990.0",
    "@aws-sdk/client-s3": "^3.990.0",
    "@aws-sdk/lib-dynamodb": "^3.991.0",
    "@aws-sdk/s3-request-presigner": "^3.990.0",
    "@aws-sdk/util-dynamodb": "^3.990.0",
    "uuid": "^13.0.0"
  }
}
"@ | Out-File -FilePath "package.json" -Encoding UTF8
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install --production

Write-Host "Lambda package prepared!" -ForegroundColor Green
Set-Location ..
