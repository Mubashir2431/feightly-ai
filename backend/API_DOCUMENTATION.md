# Feightly.ai API Documentation

## Overview

The Feightly.ai REST API provides endpoints for load searching, booking, autonomous negotiation, and driver management. All endpoints return JSON responses and use standard HTTP status codes.

## Base URL

```
https://{api-id}.execute-api.us-east-1.amazonaws.com/prod/
```

Replace `{api-id}` with your actual API Gateway ID from the deployment outputs.

## Authentication

Currently, the API does not require authentication. In production, implement API keys or AWS Cognito authentication.

## Common Response Headers

All responses include:
- `Content-Type: application/json`
- `Access-Control-Allow-Origin: *` (CORS enabled)
- `X-Request-Id`: Unique request identifier for tracing

## Error Response Format

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "requestId": "uuid-request-id"
}
```

### HTTP Status Codes

- `200 OK`: Request succeeded
- `400 Bad Request`: Invalid input or missing required fields
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., load already booked)
- `500 Internal Server Error`: Server-side error
- `503 Service Unavailable`: External service (Bedrock) unavailable
- `504 Gateway Timeout`: Request timeout

---

## Endpoints

### 1. Search Loads

Search for available freight loads with optional filters.

**Endpoint:** `GET /loads`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| originCity | string | No | Filter by origin city (e.g., "Chicago") |
| destCity | string | No | Filter by destination city (e.g., "Dallas") |
| equipment | string | No | Filter by equipment type: "Dry Van", "Reefer", or "Flatbed" |
| minRate | number | No | Minimum rate per mile (e.g., 2.5) |
| maxDeadhead | number | No | Maximum deadhead miles from driver location |
| bookingType | string | No | Filter by booking type: "book_now", "negotiable", or "hot" |
| driverId | string | No | Driver ID (required if using maxDeadhead) |

**Example Request:**

```bash
curl "https://abc123.execute-api.us-east-1.amazonaws.com/prod/loads?equipment=Dry%20Van&minRate=2.5&bookingType=book_now"
```

**Success Response (200 OK):**

```json
{
  "loads": [
    {
      "loadId": "load-001",
      "origin": {
        "city": "Chicago",
        "state": "IL",
        "lat": 41.8781,
        "lng": -87.6298,
        "address": "123 W Main St, Chicago, IL 60601"
      },
      "destination": {
        "city": "Dallas",
        "state": "TX",
        "lat": 32.7767,
        "lng": -96.7970,
        "address": "456 Commerce St, Dallas, TX 75201"
      },
      "distanceMiles": 925,
      "equipment": "Dry Van",
      "weightLbs": 42000,
      "postedRate": 2.75,
      "marketRateAvg": 2.65,
      "marketRateHigh": 2.95,
      "marketRateLow": 2.35,
      "rateTrend": "stable",
      "bookingType": "book_now",
      "bookNowRate": 2.75,
      "broker": {
        "name": "ABC Freight Brokers",
        "contact": "John Smith",
        "email": "john@abcfreight.com",
        "phone": "+1-555-0123",
        "rating": 4.5,
        "paymentTerms": "Net 30",
        "onTimePayment": 95
      },
      "pickupWindow": "2024-03-15T08:00:00Z",
      "deliveryDeadline": "2024-03-16T17:00:00Z",
      "status": "available"
    }
  ],
  "hasMore": false,
  "requestId": "req-uuid-123"
}
```

**Error Response (400 Bad Request):**

```json
{
  "error": {
    "code": "INVALID_EQUIPMENT",
    "message": "Equipment must be one of: Dry Van, Reefer, Flatbed"
  },
  "requestId": "req-uuid-123"
}
```

---

### 2. Get Load Details

Retrieve detailed information about a specific load.

**Endpoint:** `GET /loads/{loadId}`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| loadId | string | Yes | Unique load identifier |

**Example Request:**

```bash
curl "https://abc123.execute-api.us-east-1.amazonaws.com/prod/loads/load-001"
```

**Success Response (200 OK):**

```json
{
  "loadId": "load-001",
  "origin": {
    "city": "Chicago",
    "state": "IL",
    "lat": 41.8781,
    "lng": -87.6298,
    "address": "123 W Main St, Chicago, IL 60601"
  },
  "destination": {
    "city": "Dallas",
    "state": "TX",
    "lat": 32.7767,
    "lng": -96.7970,
    "address": "456 Commerce St, Dallas, TX 75201"
  },
  "distanceMiles": 925,
  "equipment": "Dry Van",
  "weightLbs": 42000,
  "postedRate": 2.75,
  "marketRateAvg": 2.65,
  "marketRateHigh": 2.95,
  "marketRateLow": 2.35,
  "rateTrend": "stable",
  "bookingType": "book_now",
  "bookNowRate": 2.75,
  "broker": {
    "name": "ABC Freight Brokers",
    "contact": "John Smith",
    "email": "john@abcfreight.com",
    "phone": "+1-555-0123",
    "rating": 4.5,
    "paymentTerms": "Net 30",
    "onTimePayment": 95
  },
  "pickupWindow": "2024-03-15T08:00:00Z",
  "deliveryDeadline": "2024-03-16T17:00:00Z",
  "status": "available",
  "requestId": "req-uuid-123"
}
```

**Error Response (404 Not Found):**

```json
{
  "error": {
    "code": "LOAD_NOT_FOUND",
    "message": "Load with ID load-999 not found"
  },
  "requestId": "req-uuid-123"
}
```

---

### 3. Book Load

Book an available load instantly.

**Endpoint:** `POST /loads/{loadId}/book`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| loadId | string | Yes | Unique load identifier |

**Request Body:**

```json
{
  "driverId": "driver-456"
}
```

**Example Request:**

```bash
curl -X POST "https://abc123.execute-api.us-east-1.amazonaws.com/prod/loads/load-001/book" \
  -H "Content-Type: application/json" \
  -d '{"driverId":"driver-456"}'
```

**Success Response (200 OK):**

```json
{
  "bookingId": "booking-789",
  "loadId": "load-001",
  "driverId": "driver-456",
  "finalRate": 2.75,
  "status": "confirmed",
  "bookedAt": "2024-03-14T10:30:00Z",
  "rateConDocId": "doc-rc-001",
  "requestId": "req-uuid-123"
}
```

**Error Response (400 Bad Request):**

```json
{
  "error": {
    "code": "LOAD_NOT_AVAILABLE",
    "message": "Load is not available for booking"
  },
  "requestId": "req-uuid-123"
}
```

**Error Response (409 Conflict):**

```json
{
  "error": {
    "code": "LOAD_ALREADY_BOOKED",
    "message": "Load has already been booked by another driver"
  },
  "requestId": "req-uuid-123"
}
```

---

### 4. Start Negotiation

Initiate autonomous AI-powered negotiation with a broker.

**Endpoint:** `POST /negotiate`

**Request Body:**

```json
{
  "loadId": "load-002",
  "driverId": "driver-456",
  "strategy": "moderate"
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| loadId | string | Yes | Load to negotiate |
| driverId | string | Yes | Driver initiating negotiation |
| strategy | string | Yes | Negotiation strategy: "aggressive", "moderate", or "conservative" |

**Example Request:**

```bash
curl -X POST "https://abc123.execute-api.us-east-1.amazonaws.com/prod/negotiate" \
  -H "Content-Type: application/json" \
  -d '{
    "loadId": "load-002",
    "driverId": "driver-456",
    "strategy": "moderate"
  }'
```

**Success Response (200 OK):**

```json
{
  "negotiationId": "neg-001",
  "status": "in_progress",
  "initialOffer": {
    "round": 1,
    "amount": 2.85,
    "sender": "driver",
    "timestamp": "2024-03-14T10:35:00Z",
    "emailBody": "Dear John,\n\nI'm interested in your Chicago to Dallas load (925 miles). Based on current market conditions showing an average rate of $2.65/mile with a high of $2.95/mile, I'd like to propose a rate of $2.85 per mile for this shipment.\n\nThis rate reflects the strong market conditions and ensures reliable, professional service for your load.\n\nLooking forward to your response.\n\nBest regards"
  },
  "requestId": "req-uuid-123"
}
```

**Error Response (400 Bad Request):**

```json
{
  "error": {
    "code": "INVALID_STRATEGY",
    "message": "Strategy must be one of: aggressive, moderate, conservative"
  },
  "requestId": "req-uuid-123"
}
```

**Error Response (503 Service Unavailable):**

```json
{
  "error": {
    "code": "BEDROCK_UNAVAILABLE",
    "message": "AI service temporarily unavailable. Please try again."
  },
  "requestId": "req-uuid-123"
}
```

---

### 5. Get Negotiation Status

Retrieve the current status and history of a negotiation.

**Endpoint:** `GET /negotiations/{negotiationId}`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| negotiationId | string | Yes | Unique negotiation identifier |

**Example Request:**

```bash
curl "https://abc123.execute-api.us-east-1.amazonaws.com/prod/negotiations/neg-001"
```

**Success Response (200 OK):**

```json
{
  "negotiationId": "neg-001",
  "loadId": "load-002",
  "driverId": "driver-456",
  "brokerEmail": "john@abcfreight.com",
  "driverMinRate": 2.70,
  "marketRate": 2.65,
  "postedRate": 2.50,
  "maxRounds": 4,
  "currentRound": 2,
  "strategy": "moderate",
  "status": "in_progress",
  "offers": [
    {
      "round": 1,
      "amount": 2.85,
      "sender": "driver",
      "timestamp": "2024-03-14T10:35:00Z",
      "emailBody": "Dear John,\n\nI'm interested in your Chicago to Dallas load..."
    },
    {
      "round": 2,
      "amount": 2.75,
      "sender": "broker",
      "timestamp": "2024-03-14T11:15:00Z",
      "emailBody": "Thanks for your interest. I can offer $2.75/mile..."
    }
  ],
  "n8nWebhookUrl": "https://n8n.example.com/webhook/feightly",
  "requestId": "req-uuid-123"
}
```

**Error Response (404 Not Found):**

```json
{
  "error": {
    "code": "NEGOTIATION_NOT_FOUND",
    "message": "Negotiation with ID neg-999 not found"
  },
  "requestId": "req-uuid-123"
}
```

---

### 6. Handle Broker Response

Process a broker's response in an ongoing negotiation (typically called by n8n webhook).

**Endpoint:** `POST /negotiations/{negotiationId}/broker-response`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| negotiationId | string | Yes | Unique negotiation identifier |

**Request Body:**

```json
{
  "brokerEmail": "john@abcfreight.com",
  "emailBody": "I can offer $2.75 per mile for this load. Let me know if that works.",
  "counterOffer": 2.75
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| brokerEmail | string | Yes | Broker's email address |
| emailBody | string | Yes | Full text of broker's email |
| counterOffer | number | No | Broker's counter-offer rate (extracted from email if not provided) |

**Example Request:**

```bash
curl -X POST "https://abc123.execute-api.us-east-1.amazonaws.com/prod/negotiations/neg-001/broker-response" \
  -H "Content-Type: application/json" \
  -d '{
    "brokerEmail": "john@abcfreight.com",
    "emailBody": "I can offer $2.75 per mile for this load.",
    "counterOffer": 2.75
  }'
```

**Success Response - Accepted (200 OK):**

```json
{
  "negotiationId": "neg-001",
  "status": "accepted",
  "currentRound": 2,
  "latestOffer": {
    "round": 2,
    "amount": 2.75,
    "sender": "broker"
  },
  "bookingId": "booking-790",
  "message": "Negotiation accepted. Booking created.",
  "requestId": "req-uuid-123"
}
```

**Success Response - Continuing (200 OK):**

```json
{
  "negotiationId": "neg-001",
  "status": "in_progress",
  "currentRound": 3,
  "latestOffer": {
    "round": 3,
    "amount": 2.80,
    "sender": "driver",
    "emailBody": "Thank you for your offer. I can meet you at $2.80/mile..."
  },
  "requestId": "req-uuid-123"
}
```

**Success Response - Walked Away (200 OK):**

```json
{
  "negotiationId": "neg-001",
  "status": "walked_away",
  "currentRound": 4,
  "message": "Maximum negotiation rounds reached. No agreement.",
  "requestId": "req-uuid-123"
}
```

---

### 7. Get Driver Dashboard

Retrieve performance metrics for a driver.

**Endpoint:** `GET /driver/{driverId}/dashboard`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| driverId | string | Yes | Unique driver identifier |

**Example Request:**

```bash
curl "https://abc123.execute-api.us-east-1.amazonaws.com/prod/driver/driver-456/dashboard"
```

**Success Response (200 OK):**

```json
{
  "driverId": "driver-456",
  "totalEarnings": 125430.50,
  "loadsCompleted": 48,
  "avgRate": 2.68,
  "requestId": "req-uuid-123"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| driverId | string | Driver identifier |
| totalEarnings | number | Total earnings from all delivered loads ($) |
| loadsCompleted | number | Count of completed loads |
| avgRate | number | Average rate per mile across all loads ($/mile) |

---

### 8. Get Driver Documents

Retrieve all documents for a driver with presigned download URLs.

**Endpoint:** `GET /driver/{driverId}/documents`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| driverId | string | Yes | Unique driver identifier |

**Example Request:**

```bash
curl "https://abc123.execute-api.us-east-1.amazonaws.com/prod/driver/driver-456/documents"
```

**Success Response (200 OK):**

```json
{
  "documents": [
    {
      "docId": "doc-rc-001",
      "loadId": "load-001",
      "driverId": "driver-456",
      "docType": "rate_confirmation",
      "createdAt": "2024-03-14T10:30:00Z",
      "downloadUrl": "https://feightly-documents-123456789012.s3.amazonaws.com/doc-rc-001.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=..."
    },
    {
      "docId": "doc-bol-002",
      "loadId": "load-003",
      "driverId": "driver-456",
      "docType": "bol",
      "createdAt": "2024-03-10T14:20:00Z",
      "downloadUrl": "https://feightly-documents-123456789012.s3.amazonaws.com/doc-bol-002.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=..."
    }
  ],
  "requestId": "req-uuid-123"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| docId | string | Document identifier |
| loadId | string | Associated load ID |
| driverId | string | Driver who owns the document |
| docType | string | Document type: "rate_confirmation", "bol", "pod", or "invoice" |
| createdAt | string | ISO 8601 timestamp |
| downloadUrl | string | Presigned S3 URL (valid for 1 hour) |

---

## Data Models

### Load Object

```typescript
{
  loadId: string;
  origin: Location;
  destination: Location;
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
  broker: BrokerInfo;
  pickupWindow: string; // ISO 8601
  deliveryDeadline: string; // ISO 8601
  status: 'available' | 'booked' | 'in_negotiation';
}
```

### Location Object

```typescript
{
  city: string;
  state: string;
  lat: number;
  lng: number;
  address: string;
}
```

### Broker Info Object

```typescript
{
  name: string;
  contact: string;
  email: string;
  phone: string;
  rating: number; // 0-5
  paymentTerms: string;
  onTimePayment: number; // Percentage 0-100
}
```

### Booking Object

```typescript
{
  bookingId: string;
  loadId: string;
  driverId: string;
  finalRate: number;
  status: 'confirmed' | 'in_transit' | 'delivered';
  bookedAt: string; // ISO 8601
  rateConDocId: string;
}
```

### Negotiation Object

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
  offers: Offer[];
  n8nWebhookUrl: string;
}
```

### Offer Object

```typescript
{
  round: number;
  amount: number;
  sender: 'driver' | 'broker';
  timestamp: string; // ISO 8601
  emailBody: string;
}
```

---

## Rate Limiting

Current configuration:
- Rate limit: 100 requests per second
- Burst limit: 200 requests

Exceeding these limits will result in `429 Too Many Requests` responses.

## CORS Configuration

All endpoints support CORS with:
- Allowed Origins: `*` (all origins)
- Allowed Methods: `GET, POST, OPTIONS`
- Allowed Headers: `Content-Type, Authorization, X-Api-Key, X-Request-Id`

## Best Practices

1. **Always check status codes**: Don't assume 200 OK
2. **Store requestId**: Include in support requests for debugging
3. **Handle retries**: Implement exponential backoff for 5xx errors
4. **Validate inputs**: Check data before sending to reduce 400 errors
5. **Cache load searches**: Reduce API calls by caching search results
6. **Use presigned URLs promptly**: Document download URLs expire after 1 hour
7. **Monitor rate limits**: Implement client-side throttling

## Support

For API issues or questions:
- Check CloudWatch Logs for detailed error messages
- Include `requestId` from error responses
- Review this documentation for correct request formats
