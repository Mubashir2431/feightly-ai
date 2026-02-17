# Shared Lambda Utilities

This directory contains shared utilities used across all Lambda functions in the Feightly.ai backend.

## Modules

### types.ts
TypeScript interfaces and types for all data models:
- **Load**: Freight load opportunities
- **Driver**: Driver profiles and preferences
- **Negotiation**: Negotiation records with offer history
- **Document**: Document metadata
- **Booking**: Confirmed load bookings
- **API Request/Response types**: Standardized API interfaces

### validation.ts
Input validation utilities:
- `validateEnum()`: Validates enum field values
- `validateEquipment()`: Validates equipment type
- `validateBookingType()`: Validates booking type
- `validateNegotiationStrategy()`: Validates negotiation strategy
- `validatePositiveNumber()`: Validates positive numeric values
- `validateEmail()`: Validates email format
- `validateRequiredFields()`: Validates required fields are present
- `validateTimestamp()`: Validates ISO 8601 timestamp format
- `getCurrentTimestamp()`: Generates current timestamp

### response.ts
API response formatting utilities:
- `successResponse()`: Creates successful API response (200)
- `errorResponse()`: Creates error API response
- `badRequestError()`: Creates 400 Bad Request response
- `notFoundError()`: Creates 404 Not Found response
- `conflictError()`: Creates 409 Conflict response
- `internalServerError()`: Creates 500 Internal Server Error response
- `serviceUnavailableError()`: Creates 503 Service Unavailable response
- `gatewayTimeoutError()`: Creates 504 Gateway Timeout response
- `validateRequiredFieldsResponse()`: Validates required fields and returns error if missing
- `logError()`: Logs errors with context
- `logInfo()`: Logs info messages with context
- `generateRequestId()`: Generates unique request ID

### dynamodb.ts
DynamoDB client wrapper with error handling:
- `getItem()`: Get item from table
- `putItem()`: Put item into table
- `updateItem()`: Update item in table
- `deleteItem()`: Delete item from table
- `scanTable()`: Scan table with filters
- `queryTable()`: Query table with key condition
- `transactWrite()`: Execute transaction with multiple operations
- `getTableName()`: Get table name from environment variable
- Table name getters: `getLoadsTableName()`, `getDriversTableName()`, etc.

### utils.ts
General utility functions:
- `calculateDistance()`: Calculate distance between coordinates (Haversine formula)
- `calculateLocationDistance()`: Calculate distance between two locations
- `generateId()`: Generate unique ID with prefix
- `parseQueryParams()`: Parse query string parameters
- `parseBody()`: Parse JSON request body
- `sleep()`: Sleep for specified milliseconds
- `retryWithBackoff()`: Retry function with exponential backoff
- `chunkArray()`: Chunk array into smaller arrays
- `formatCurrency()`: Format currency value
- `formatDistance()`: Format distance value

## Usage

Import shared utilities in Lambda functions:

```typescript
import {
  Load,
  Driver,
  successResponse,
  errorResponse,
  badRequestError,
  notFoundError,
  getItem,
  putItem,
  scanTable,
  getLoadsTableName,
  validateEquipment,
  validatePositiveNumber,
  validateRequiredFields,
  calculateDistance,
  parseQueryParams,
  parseBody,
  logInfo,
  logError,
} from './shared';
```

## Example: Lambda Handler

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  successResponse,
  badRequestError,
  notFoundError,
  internalServerError,
  getItem,
  getLoadsTableName,
  Load,
  logInfo,
  logError,
  generateRequestId,
} from './shared';

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  try {
    logInfo('Processing request', {
      operation: 'getLoad',
      requestId,
      loadId: event.pathParameters?.loadId,
    });

    const loadId = event.pathParameters?.loadId;
    if (!loadId) {
      return badRequestError('Missing loadId parameter', undefined, requestId);
    }

    const load = await getItem<Load>(getLoadsTableName(), { loadId });

    if (!load) {
      return notFoundError('Load', loadId, requestId);
    }

    return successResponse(load, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'getLoad',
      requestId,
    });
    return internalServerError('Failed to retrieve load', requestId);
  }
}
```

## Environment Variables

The shared utilities expect the following environment variables:

- `AWS_REGION`: AWS region (default: us-east-1)
- `LOADS_TABLE_NAME`: Loads DynamoDB table name
- `DRIVERS_TABLE_NAME`: Drivers DynamoDB table name
- `NEGOTIATIONS_TABLE_NAME`: Negotiations DynamoDB table name
- `DOCUMENTS_TABLE_NAME`: Documents DynamoDB table name
- `BOOKINGS_TABLE_NAME`: Bookings DynamoDB table name
- `DOCUMENTS_BUCKET_NAME`: S3 bucket name for documents
- `BEDROCK_MODEL_ID`: Amazon Bedrock model ID
- `N8N_WEBHOOK_URL`: n8n webhook URL for email automation

## Error Handling

All DynamoDB operations include error handling and will throw descriptive errors:

```typescript
try {
  const load = await getItem<Load>(getLoadsTableName(), { loadId });
} catch (error) {
  // Error is logged and includes context
  // Handle appropriately in Lambda function
}
```

## Validation

Always validate inputs before processing:

```typescript
// Validate required fields
const validation = validateRequiredFields(body, ['loadId', 'driverId']);
if (!validation.valid) {
  return badRequestError(
    `Missing required fields: ${validation.missingFields?.join(', ')}`
  );
}

// Validate enum values
const equipmentValidation = validateEquipment(body.equipment);
if (!equipmentValidation.valid) {
  return badRequestError(equipmentValidation.error!);
}

// Validate positive numbers
const rateValidation = validatePositiveNumber(body.rate, 'rate');
if (!rateValidation.valid) {
  return badRequestError(rateValidation.error!);
}
```

## Response Format

All API responses follow a consistent format:

**Success Response:**
```json
{
  "loadId": "load-123",
  "origin": { "city": "Chicago", "state": "IL", ... },
  ...
}
```

**Error Response:**
```json
{
  "error": {
    "code": "LOAD_NOT_FOUND",
    "message": "Load with ID load-123 not found"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Testing

When writing tests for Lambda functions, mock the shared utilities:

```typescript
import { getItem, putItem } from './shared';

jest.mock('./shared', () => ({
  ...jest.requireActual('./shared'),
  getItem: jest.fn(),
  putItem: jest.fn(),
}));

describe('Load Handler', () => {
  it('should return load when found', async () => {
    (getItem as jest.Mock).mockResolvedValue({
      loadId: 'load-123',
      status: 'available',
    });

    const result = await handler(mockEvent);
    expect(result.statusCode).toBe(200);
  });
});
```

## Best Practices

1. **Always use shared types**: Import types from `types.ts` for consistency
2. **Validate all inputs**: Use validation utilities before processing
3. **Use standard responses**: Use response utilities for consistent API responses
4. **Log with context**: Include requestId and operation in all logs
5. **Handle errors gracefully**: Catch errors and return appropriate error responses
6. **Use transactions**: Use `transactWrite()` for operations that must be atomic
7. **Retry transient errors**: Use `retryWithBackoff()` for operations that may fail temporarily
