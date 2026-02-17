#!/bin/bash
# Prepare Lambda deployment package with dependencies

echo "Preparing Lambda deployment package..."

cd lambda

# Create package.json if it doesn't exist
if [ ! -f "package.json" ]; then
  echo "Creating package.json..."
  cat > package.json << 'EOF'
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
EOF
fi

# Install dependencies
echo "Installing dependencies..."
npm install --production

echo "✅ Lambda package prepared!"
cd ..
