# Design Document: Voice Input & AI Copilot

## Overview

The Voice Input & AI Copilot feature provides natural language understanding for load searching in the Feightly.ai trucking platform. The system consists of two AWS Lambda functions that process text and voice input, leveraging Amazon Bedrock (Claude 3 Haiku) for intent parsing and Amazon Transcribe for speech-to-text conversion.

The design follows a serverless architecture pattern with clear separation between text processing (Copilot Lambda) and voice processing (Voice Input Lambda), while sharing common parsing logic through the Bedrock integration.

## Architecture

### System Components

```
┌─────────────┐
│   Driver    │
│   Client    │
└──────┬──────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│   Copilot    │  │    Voice     │
│   Lambda     │  │    Lambda    │
│ (POST /copilot)│ │(POST /voice) │
└──────┬───────┘  └──────┬───────┘
       │                 │
       │                 ├──────────┐
       │                 │          │
       │                 ▼          ▼
       │          ┌──────────┐ ┌────────┐
       │          │   S3     │ │Transcribe│
       │          │  Bucket  │ │ Client  │
       │          └──────────┘ └────┬───┘
       │                            │
       │                            ▼
       │                      ┌──────────┐
       │                      │Transcript│
       │                      │   Text   │
       │                      └────┬─────┘
       │                           │
       ├───────────────────────────┘
       │
       ▼
┌──────────────┐
│   Bedrock    │
│   Client     │
│ (Claude 3    │
│   Haiku)     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Parsed     │
│   Intent     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Search     │
│  Parameters  │
└──────────────┘
```

### Data Flow

**Text Input Flow (Copilot Lambda):**
1. Client sends POST request with text, driverId, optional GPS coordinates
2. Lambda validates request body
3. Lambda calls Bedrock to parse natural language into structured intent
4. If origin is missing and GPS provided, perform reverse geocoding
5. Convert parsed intent to search parameters
6. Generate friendly confirmation message
7. Return response with parsed intent, search parameters, and message

**Voice Input Flow (Voice Lambda):**
1. Client sends POST request with base64 audio, driverId, optional GPS coordinates
2. Lambda validates request body
3. Lambda uploads audio to S3 with unique key
4. Lambda starts Transcribe job pointing to S3 audio
5. Lambda polls Transcribe job status (max 15 seconds)
6. Lambda retrieves transcript from Transcribe output
7. Lambda calls Bedrock to parse transcript (same as text flow)
8. If origin is missing and GPS provided, perform reverse geocoding
9. Convert parsed intent to search parameters
10. Generate friendly confirmation message
11. Return response with transcript, parsed intent, search parameters, and message

## Components and Interfaces

### Copilot Lambda

**Endpoint:** `POST /copilot`

**Request Interface:**
```typescript
interface CopilotRequest {
  text: string;              // Natural language input from driver
  driverId: string;          // Unique driver identifier
  currentLat?: number;       // Optional GPS latitude
  currentLng?: number;       // Optional GPS longitude
}
```

**Response Interface:**
```typescript
interface CopilotResponse {
  parsed: ParsedIntent;           // Structured intent
  searchParams: SearchParams;     // Load-search API parameters
  copilotMessage: string;         // Friendly confirmation
}
```

**Configuration:**
- Timeout: 60 seconds
- Memory: 1024 MB
- Runtime: Node.js (TypeScript compiled to CommonJS)
- Region: us-east-1

### Voice Input Lambda

**Endpoint:** `POST /voice`

**Request Interface:**
```typescript
interface VoiceRequest {
  audioBase64: string;       // Base64-encoded audio data
  driverId: string;          // Unique driver identifier
  contentType?: string;      // Audio MIME type (default: "audio/wav")
  currentLat?: number;       // Optional GPS latitude
  currentLng?: number;       // Optional GPS longitude
}
```

**Response Interface:**
```typescript
interface VoiceResponse {
  transcript: string;             // Transcribed text
  parsed: ParsedIntent;           // Structured intent
  searchParams: SearchParams;     // Load-search API parameters
  copilotMessage: string;         // Friendly confirmation
}
```

**Configuration:**
- Timeout: 120 seconds
- Memory: 1024 MB
- Runtime: Node.js (TypeScript compiled to CommonJS)
- Region: us-east-1

### Bedrock Integration

**Model:** anthropic.claude-3-haiku-20240307-v1:0

**Configuration:**
```typescript
{
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 1000,
  temperature: 0.1,
  system: <system_prompt>,
  messages: [{ role: 'user', content: <user_text> }]
}
```

**System Prompt Structure:**
- Role definition: "You are a trucking AI copilot"
- Output format: "Return ONLY valid JSON, no other text"
- Field definitions with types and constraints
- Example inputs and outputs for few-shot learning
- Supported trip types, equipment types, and field formats

**Parsing Function:**
```typescript
async function parseIntentWithBedrock(
  text: string,
  requestId: string
): Promise<ParsedIntent>
```

### Transcribe Integration

**Configuration:**
```typescript
{
  TranscriptionJobName: `voice-${driverId}-${timestamp}`,
  LanguageCode: 'en-US',
  MediaFormat: 'wav',
  Media: { MediaFileUri: `s3://${bucket}/${key}` },
  OutputBucketName: <bucket>
}
```

**Polling Strategy:**
- Poll interval: 1 second
- Max attempts: 15
- Total timeout: 15 seconds
- Status checks: COMPLETED, FAILED, IN_PROGRESS

**Transcription Function:**
```typescript
async function transcribeAudio(
  s3Key: string,
  driverId: string,
  requestId: string
): Promise<string>
```

### S3 Storage

**Audio Storage Pattern:**
- Path: `voice/{driverId}/{timestamp}.wav`
- Content-Type: Configurable (default: audio/wav)
- Bucket: Environment variable DOCUMENTS_BUCKET_NAME

**Upload Function:**
```typescript
async function uploadAudioToS3(
  audioBase64: string,
  driverId: string,
  contentType: string,
  requestId: string
): Promise<string>
```

### Reverse Geocoding

**Major Cities Database:**
```typescript
const MAJOR_CITIES = [
  { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
  { city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
  // ... 15 major cities total
];
```

**Distance Calculation:**
- Algorithm: Haversine formula
- Implementation: `calculateDistance(lat1, lng1, lat2, lng2)` from shared utilities
- Returns: Distance in miles

**Geocoding Function:**
```typescript
function findNearestCity(
  lat: number,
  lng: number
): { city: string; state: string }
```

**Logic:**
1. Initialize with first city as nearest
2. Calculate distance to first city
3. Iterate through all cities
4. Update nearest if distance is smaller
5. Return city with minimum distance

## Data Models

### ParsedIntent

```typescript
interface ParsedIntent {
  tripType: 'one_way' | 'round_trip' | 'open_ended' | 'backhaul' | 'multi_day';
  originCity: string | null;
  originState: string | null;      // 2-letter state code
  destCity: string | null;
  destState: string | null;        // 2-letter state code
  equipment: 'Dry Van' | 'Reefer' | 'Flatbed' | null;
  minRate: number | null;          // Dollars per mile
  maxDeadhead: number | null;      // Miles
  homeCity: string | null;         // For backhaul/round_trip
  homeState: string | null;        // 2-letter state code
  timeConstraint: string | null;   // Free-form text (e.g., "by Friday")
  avoidRegions: string[] | null;   // Array of region names
  notes: string;                   // Additional context
}
```

**Field Semantics:**
- `tripType`: Determines search strategy and UI presentation
- `originCity/originState`: Starting location (may be populated by reverse geocoding)
- `destCity/destState`: Destination location (null for open-ended searches)
- `equipment`: Trailer type filter
- `minRate`: Minimum acceptable payment rate
- `maxDeadhead`: Maximum empty miles willing to travel
- `homeCity/homeState`: Driver's home base (for backhaul/round_trip planning)
- `timeConstraint`: Delivery deadline or time window
- `avoidRegions`: Geographic areas to exclude from routing
- `notes`: Unstructured context for future use

### SearchParams

```typescript
interface SearchParams {
  originCity?: string;
  destCity?: string;
  equipment?: string;
  minRate?: number;
  maxDeadhead?: number;
  bookingType?: string;
}
```

**Mapping Rules:**
- Only include fields that are non-null in ParsedIntent
- Field names match load-search API query parameters
- All fields are optional (allows flexible searching)

### Error Response

```typescript
interface ErrorResponse {
  error: string;           // Error message
  requestId: string;       // Unique request identifier
  details?: any;          // Optional error details
}
```

**Standard Error Codes:**
- 400: Bad Request (validation failure)
- 500: Internal Server Error (unexpected failure)
- 503: Service Unavailable (external service failure)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: ParsedIntent Structure Completeness

*For any* text input processed by the Copilot service, the returned ParsedIntent SHALL contain all required fields (tripType, originCity, originState, destCity, destState, equipment, minRate, maxDeadhead, homeCity, homeState, timeConstraint, avoidRegions, notes), even if some fields are null.

**Validates: Requirements 1.2, 1.8**

### Property 2: SearchParams Field Mapping

*For any* ParsedIntent, the generated SearchParams SHALL include a field if and only if that field is non-null in the ParsedIntent, and the field name SHALL match the load-search API parameter name.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

### Property 3: Reverse Geocoding Nearest City Selection

*For any* GPS coordinates (latitude, longitude), the reverse geocoding function SHALL return the major city with the minimum Haversine distance from those coordinates.

**Validates: Requirements 3.4**

### Property 4: Reverse Geocoding Triggers When Origin Missing

*For any* ParsedIntent with null originCity AND provided GPS coordinates, the Copilot service SHALL populate originCity and originState with the nearest major city from reverse geocoding.

**Validates: Requirements 3.2**

### Property 5: Copilot Message Generation Completeness

*For any* ParsedIntent, the generated copilot message SHALL be a non-empty string that describes the understood search intent.

**Validates: Requirements 5.1**

### Property 6: Trip Type Message Inclusion

*For any* ParsedIntent with tripType "backhaul", the copilot message SHALL contain "Looking for loads to get you home"; for tripType "round_trip", it SHALL contain "Looking for round trip loads"; for tripType "open_ended", it SHALL contain "Searching for available loads".

**Validates: Requirements 5.2, 5.3, 5.4**

### Property 7: Location Information in Messages

*For any* ParsedIntent with both originCity and destCity non-null, the copilot message SHALL contain both the origin city name and destination city name.

**Validates: Requirements 5.5**

### Property 8: Equipment Type in Messages

*For any* ParsedIntent with non-null equipment, the copilot message SHALL contain the equipment type value.

**Validates: Requirements 5.6**

### Property 9: Rate Information in Messages

*For any* ParsedIntent with non-null minRate, the copilot message SHALL contain the rate value formatted as a decimal number.

**Validates: Requirements 5.7**

### Property 10: S3 Key Format for Audio Files

*For any* audio upload with driverId and timestamp, the generated S3 key SHALL match the pattern "voice/{driverId}/{timestamp}.wav".

**Validates: Requirements 6.2**

### Property 11: Voice and Text Parsing Consistency

*For any* text string, parsing it through the Copilot service SHALL produce the same ParsedIntent as transcribing audio of that text through the Voice service and parsing the transcript.

**Validates: Requirements 6.8**

### Property 12: Voice Response Structure Completeness

*For any* successful voice processing request, the response SHALL contain all four required fields: transcript (string), parsed (ParsedIntent), searchParams (SearchParams), and copilotMessage (string).

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 13: Reverse Geocoding Consistency Across Services

*For any* GPS coordinates, the Copilot service and Voice service SHALL return the same nearest major city when performing reverse geocoding.

**Validates: Requirements 7.5**

### Property 14: Content Type Handling

*For any* voice request with a specified contentType, the S3 upload SHALL use that contentType; for any voice request without contentType, the S3 upload SHALL use "audio/wav" as the default.

**Validates: Requirements 12.1**

### Property 15: System Prompt Consistency

*For any* call to Bedrock, both the Copilot service and Voice service SHALL use identical system prompts to ensure consistent parsing behavior.

**Validates: Requirements 15.7**

## Error Handling

### Validation Errors (400 Bad Request)

**Missing Request Body:**
- Condition: Request body is null or undefined
- Response: 400 with message "Request body is required"
- Validates: Requirements 8.1, 8.4

**Missing Text Field (Copilot):**
- Condition: Request body lacks "text" field or text is not a string
- Response: 400 with message "Field 'text' is required and must be a string"
- Validates: Requirements 8.2

**Missing DriverId Field:**
- Condition: Request body lacks "driverId" field or driverId is not a string
- Response: 400 with message "Field 'driverId' is required and must be a string"
- Validates: Requirements 8.3, 8.6

**Missing AudioBase64 Field (Voice):**
- Condition: Request body lacks "audioBase64" field or audioBase64 is not a string
- Response: 400 with message "Field 'audioBase64' is required and must be a string"
- Validates: Requirements 8.5

### Service Unavailability Errors (503 Service Unavailable)

**Bedrock Throttling:**
- Condition: Bedrock returns ThrottlingException
- Response: 503 with service name "Bedrock"
- Validates: Requirements 9.1

**Bedrock Service Unavailable:**
- Condition: Bedrock returns ServiceUnavailableException
- Response: 503 with service name "Bedrock"
- Validates: Requirements 9.2

**Transcribe Timeout:**
- Condition: Transcription job does not complete within 15 seconds
- Response: 503 with service name "Transcribe (timeout)"
- Validates: Requirements 9.6

### Internal Server Errors (500 Internal Server Error)

**Bedrock Parsing Failure:**
- Condition: Bedrock call fails for reasons other than throttling/unavailability
- Response: 500 with message "Failed to parse intent"
- Validates: Requirements 9.3

**S3 Upload Failure:**
- Condition: S3 PutObject operation fails
- Response: 500 with message "Failed to upload audio"
- Validates: Requirements 9.4

**Transcribe Failure:**
- Condition: Transcription job fails or transcript retrieval fails
- Response: 500 with message "Failed to transcribe audio"
- Validates: Requirements 9.5

**Unexpected Errors:**
- Condition: Any unhandled exception occurs
- Response: 500 with message "An unexpected error occurred"
- Validates: Requirements 9.7, 9.8

### Error Response Format

All errors follow the shared response utility format:
```typescript
{
  error: string,        // Human-readable error message
  requestId: string,    // Unique request identifier for tracing
  details?: any        // Optional additional error context
}
```

### Logging Strategy

All errors are logged using the shared `logError` function with:
- Error object
- Operation context (operation name, requestId)
- Additional relevant parameters (driverId, text length, etc.)

This ensures comprehensive error tracking and debugging capability.

## Testing Strategy

### Dual Testing Approach

The feature requires both unit testing and property-based testing for comprehensive coverage:

**Unit Tests:**
- Specific examples demonstrating correct behavior
- Edge cases (empty inputs, boundary conditions)
- Error conditions (service failures, timeouts, validation errors)
- Integration points (S3 upload, Transcribe job creation, Bedrock calls)

**Property-Based Tests:**
- Universal properties that hold for all inputs
- Comprehensive input coverage through randomization
- Minimum 100 iterations per property test

### Property-Based Testing Configuration

**Library Selection:**
- TypeScript/JavaScript: Use `fast-check` library
- Minimum 100 iterations per test (due to randomization)
- Each test must reference its design document property

**Test Tagging Format:**
```typescript
// Feature: voice-input-ai-copilot, Property 1: ParsedIntent Structure Completeness
```

### Test Organization

**Copilot Lambda Tests:**
1. Unit tests for validation errors (8.1-8.3)
2. Unit tests for Bedrock error handling (9.1-9.3)
3. Property test for ParsedIntent structure (Property 1)
4. Property test for SearchParams mapping (Property 2)
5. Property test for reverse geocoding (Properties 3, 4)
6. Property test for message generation (Properties 5-9)
7. Integration test for end-to-end copilot flow

**Voice Lambda Tests:**
1. Unit tests for validation errors (8.4-8.6)
2. Unit tests for S3/Transcribe error handling (9.4-9.6)
3. Property test for S3 key format (Property 10)
4. Property test for voice response structure (Property 12)
5. Property test for content type handling (Property 14)
6. Integration test for end-to-end voice flow

**Cross-Service Tests:**
1. Property test for parsing consistency (Property 11)
2. Property test for reverse geocoding consistency (Property 13)
3. Property test for system prompt consistency (Property 15)

### Test Data Generation

**For Property-Based Tests:**

Generate random inputs covering:
- Various natural language patterns (routes, open searches, backhauls, round trips)
- Different equipment types and rate formats
- GPS coordinates across the continental US
- Time constraints in various formats
- Region names and avoid clauses
- Valid and invalid audio data
- Missing and present optional fields

**For Unit Tests:**

Use specific examples:
- Known city pairs (Dallas-Atlanta, Miami-Chicago, etc.)
- Standard equipment types (Dry Van, Reefer, Flatbed)
- Common rate formats ("two thirty", "$2.50/mile", "2.30 minimum")
- Typical time constraints ("by Friday", "within 2 days")
- Known error conditions (throttling, timeouts, invalid JSON)

### Mocking Strategy

**External Services:**
- Mock Bedrock client for predictable parsing responses
- Mock Transcribe client for controlled transcription scenarios
- Mock S3 client for upload verification
- Use actual Haversine distance calculation (no mocking needed)

**Shared Utilities:**
- Use actual implementations from `backend/lambda/shared/`
- Mock only when testing error paths

### Coverage Goals

- Line coverage: >80%
- Branch coverage: >75%
- All error paths tested
- All validation rules tested
- All properties verified with 100+ random inputs each
