# Requirements Document

## Introduction

The Voice Input & AI Copilot feature enables truck drivers to find loads using natural language through voice or text input. The system leverages Amazon Bedrock (Claude 3 Haiku) for natural language understanding and Amazon Transcribe for speech-to-text conversion, providing an intuitive interface for load searching that integrates with the existing Feightly.ai trucking platform.

## Glossary

- **Copilot_Service**: The natural language processing service that parses driver text input into structured search parameters
- **Voice_Service**: The speech-to-text service that transcribes audio input and parses the resulting text
- **Bedrock_Client**: Amazon Bedrock service using Claude 3 Haiku model for natural language understanding
- **Transcribe_Client**: Amazon Transcribe service for converting speech to text
- **Driver**: A truck driver user of the Feightly.ai platform
- **Load**: A freight shipment opportunity available for booking
- **Trip_Type**: Classification of load search intent (one_way, round_trip, open_ended, backhaul, multi_day)
- **Equipment_Type**: Type of trailer required (Dry Van, Reefer, Flatbed)
- **Parsed_Intent**: Structured representation of driver's natural language request
- **Search_Parameters**: Query parameters formatted for the load-search API
- **Reverse_Geocoding**: Process of converting GPS coordinates to nearest major city
- **Deadhead**: Distance traveled without cargo (empty miles)
- **Rate**: Payment per mile for hauling a load ($/mile)

## Requirements

### Requirement 1: Natural Language Text Parsing

**User Story:** As a driver, I want to describe what loads I'm looking for in plain English, so that I can quickly find relevant opportunities without navigating complex search forms.

#### Acceptance Criteria

1. WHEN a driver submits text input via the copilot endpoint, THE Copilot_Service SHALL parse the text using Bedrock_Client within 60 seconds
2. WHEN parsing text input, THE Copilot_Service SHALL extract trip type, origin city, destination city, equipment type, rate requirements, deadhead limits, time constraints, and regions to avoid
3. WHEN the text contains a specific route (e.g., "Dallas to Atlanta"), THE Copilot_Service SHALL identify both origin and destination cities with state codes
4. WHEN the text contains equipment type keywords (e.g., "dry van", "reefer", "flatbed"), THE Copilot_Service SHALL map them to standard Equipment_Type values
5. WHEN the text contains rate information (e.g., "two thirty minimum", "$2.50 per mile"), THE Copilot_Service SHALL extract the numeric rate value in dollars per mile
6. WHEN the text contains time constraints (e.g., "by Friday", "within 2 days"), THE Copilot_Service SHALL preserve the constraint as a string
7. WHEN the text contains regions to avoid (e.g., "avoid the Northeast"), THE Copilot_Service SHALL extract them as an array of region names
8. WHEN parsing completes successfully, THE Copilot_Service SHALL return a Parsed_Intent structure with all extracted fields

### Requirement 2: Trip Type Classification

**User Story:** As a driver, I want the system to understand different types of trips I'm looking for, so that search results match my specific situation.

#### Acceptance Criteria

1. WHEN the text describes a point-to-point trip (e.g., "Dallas to Atlanta"), THE Copilot_Service SHALL classify it as trip type "one_way"
2. WHEN the text describes returning home (e.g., "I need to get home to Dallas"), THE Copilot_Service SHALL classify it as trip type "backhaul" and extract home city
3. WHEN the text describes a round trip (e.g., "Dallas to Atlanta and back"), THE Copilot_Service SHALL classify it as trip type "round_trip"
4. WHEN the text describes an open search (e.g., "what loads are available"), THE Copilot_Service SHALL classify it as trip type "open_ended"
5. WHEN the text describes multi-day operations, THE Copilot_Service SHALL classify it as trip type "multi_day"

### Requirement 3: Location-Based Search with Reverse Geocoding

**User Story:** As a driver, I want to search for loads near my current location without specifying a city name, so that I can quickly find nearby opportunities.

#### Acceptance Criteria

1. WHEN a driver provides GPS coordinates (currentLat, currentLng) with their request, THE Copilot_Service SHALL accept and store the coordinates
2. WHEN the Parsed_Intent has no origin city AND GPS coordinates are provided, THE Copilot_Service SHALL perform reverse geocoding to find the nearest major city
3. WHEN performing reverse geocoding, THE Copilot_Service SHALL calculate distances to all major cities using the Haversine formula
4. WHEN multiple cities are evaluated, THE Copilot_Service SHALL select the city with minimum distance from the provided coordinates
5. THE Copilot_Service SHALL support reverse geocoding for these major cities: Dallas, Atlanta, Chicago, Philadelphia, Miami, Houston, Memphis, Los Angeles, Charlotte, Jacksonville, Nashville, Indianapolis, Kansas City, Denver, Phoenix
6. WHEN reverse geocoding completes, THE Copilot_Service SHALL update the Parsed_Intent with the identified origin city and state

### Requirement 4: Search Parameter Generation

**User Story:** As a system integrator, I want parsed intents converted to load-search API parameters, so that the copilot can seamlessly integrate with existing search functionality.

#### Acceptance Criteria

1. WHEN a Parsed_Intent contains an origin city, THE Copilot_Service SHALL include originCity in Search_Parameters
2. WHEN a Parsed_Intent contains a destination city, THE Copilot_Service SHALL include destCity in Search_Parameters
3. WHEN a Parsed_Intent contains equipment type, THE Copilot_Service SHALL include equipment in Search_Parameters
4. WHEN a Parsed_Intent contains minimum rate, THE Copilot_Service SHALL include minRate in Search_Parameters
5. WHEN a Parsed_Intent contains maximum deadhead, THE Copilot_Service SHALL include maxDeadhead in Search_Parameters
6. WHEN a Parsed_Intent field is null, THE Copilot_Service SHALL omit that field from Search_Parameters

### Requirement 5: User Feedback Messages

**User Story:** As a driver, I want to see a confirmation of what the system understood from my request, so that I can verify the search is correct before viewing results.

#### Acceptance Criteria

1. WHEN parsing completes, THE Copilot_Service SHALL generate a friendly confirmation message describing the understood search
2. WHEN the trip type is "backhaul", THE Copilot_Service SHALL include "Looking for loads to get you home" in the message
3. WHEN the trip type is "round_trip", THE Copilot_Service SHALL include "Looking for round trip loads" in the message
4. WHEN the trip type is "open_ended", THE Copilot_Service SHALL include "Searching for available loads" in the message
5. WHEN origin and destination are specified, THE Copilot_Service SHALL include "from [origin] to [destination]" in the message
6. WHEN equipment type is specified, THE Copilot_Service SHALL include the equipment type in parentheses in the message
7. WHEN minimum rate is specified, THE Copilot_Service SHALL include "at [rate]/mile or better" in the message
8. WHEN time constraints are specified, THE Copilot_Service SHALL include "need to arrive [constraint]" in the message
9. WHEN regions to avoid are specified, THE Copilot_Service SHALL include "avoiding [regions]" in the message

### Requirement 6: Voice Input Processing

**User Story:** As a driver, I want to use voice commands to search for loads, so that I can operate hands-free while driving safely.

#### Acceptance Criteria

1. WHEN a driver submits audio via the voice endpoint, THE Voice_Service SHALL accept base64-encoded audio data
2. WHEN audio is received, THE Voice_Service SHALL upload it to S3 storage with a unique key in the format "voice/{driverId}/{timestamp}.wav"
3. WHEN audio is uploaded, THE Voice_Service SHALL initiate a Transcribe_Client job with language code "en-US" and media format "wav"
4. WHEN a transcription job is started, THE Voice_Service SHALL poll for completion every 1 second for up to 15 seconds
5. WHEN a transcription job completes, THE Voice_Service SHALL retrieve the transcript text from the output URI
6. WHEN a transcription job fails, THE Voice_Service SHALL return an error indicating transcription failure
7. WHEN a transcription job exceeds 15 seconds, THE Voice_Service SHALL return a timeout error
8. WHEN transcription completes successfully, THE Voice_Service SHALL parse the transcript using the same Bedrock_Client logic as text input

### Requirement 7: Voice Response Format

**User Story:** As a driver using voice input, I want to receive both the transcript and parsed results, so that I can verify what the system heard and understood.

#### Acceptance Criteria

1. WHEN voice processing completes successfully, THE Voice_Service SHALL return the transcript text
2. WHEN voice processing completes successfully, THE Voice_Service SHALL return the Parsed_Intent structure
3. WHEN voice processing completes successfully, THE Voice_Service SHALL return Search_Parameters
4. WHEN voice processing completes successfully, THE Voice_Service SHALL return a copilot confirmation message
5. THE Voice_Service SHALL apply the same reverse geocoding logic as the Copilot_Service when GPS coordinates are provided

### Requirement 8: API Request Validation

**User Story:** As a system administrator, I want invalid requests rejected with clear error messages, so that clients can correct their requests and the system remains stable.

#### Acceptance Criteria

1. WHEN a copilot request has no body, THE Copilot_Service SHALL return a 400 error with message "Request body is required"
2. WHEN a copilot request has no "text" field, THE Copilot_Service SHALL return a 400 error with message "Field 'text' is required and must be a string"
3. WHEN a copilot request has no "driverId" field, THE Copilot_Service SHALL return a 400 error with message "Field 'driverId' is required and must be a string"
4. WHEN a voice request has no body, THE Voice_Service SHALL return a 400 error with message "Request body is required"
5. WHEN a voice request has no "audioBase64" field, THE Voice_Service SHALL return a 400 error with message "Field 'audioBase64' is required and must be a string"
6. WHEN a voice request has no "driverId" field, THE Voice_Service SHALL return a 400 error with message "Field 'driverId' is required and must be a string"

### Requirement 9: Error Handling and Service Availability

**User Story:** As a system administrator, I want graceful error handling for external service failures, so that users receive appropriate feedback and the system remains resilient.

#### Acceptance Criteria

1. WHEN Bedrock_Client returns a ThrottlingException, THE Copilot_Service SHALL return a 503 error indicating "Bedrock" service unavailability
2. WHEN Bedrock_Client returns a ServiceUnavailableException, THE Copilot_Service SHALL return a 503 error indicating "Bedrock" service unavailability
3. WHEN Bedrock_Client parsing fails for other reasons, THE Copilot_Service SHALL return a 500 error with message "Failed to parse intent"
4. WHEN S3 upload fails, THE Voice_Service SHALL return a 500 error with message "Failed to upload audio"
5. WHEN Transcribe_Client fails, THE Voice_Service SHALL return a 500 error with message "Failed to transcribe audio"
6. WHEN transcription times out, THE Voice_Service SHALL return a 503 error indicating "Transcribe (timeout)" service unavailability
7. WHEN any unexpected error occurs, THE Copilot_Service SHALL return a 500 error with message "An unexpected error occurred"
8. WHEN any unexpected error occurs, THE Voice_Service SHALL return a 500 error with message "An unexpected error occurred"

### Requirement 10: Structured Logging and Observability

**User Story:** As a system administrator, I want comprehensive logging of all operations, so that I can monitor system health and debug issues effectively.

#### Acceptance Criteria

1. WHEN a copilot request is received, THE Copilot_Service SHALL log the operation, requestId, driverId, and text length
2. WHEN calling Bedrock_Client, THE Copilot_Service SHALL log the operation, requestId, text, and model ID
3. WHEN Bedrock_Client responds, THE Copilot_Service SHALL log the operation, requestId, and stop reason
4. WHEN reverse geocoding occurs, THE Copilot_Service SHALL log the coordinates and identified nearest city
5. WHEN copilot processing completes, THE Copilot_Service SHALL log the requestId, trip type, and whether origin/destination were identified
6. WHEN a voice request is received, THE Voice_Service SHALL log the operation, requestId, driverId, audio size, and content type
7. WHEN audio is uploaded to S3, THE Voice_Service SHALL log the S3 key and file size
8. WHEN a transcription job starts, THE Voice_Service SHALL log the job name and S3 URI
9. WHEN transcription completes, THE Voice_Service SHALL log the job name and transcript length
10. WHEN voice processing completes, THE Voice_Service SHALL log the requestId, transcript length, and trip type
11. WHEN any error occurs, THE Copilot_Service SHALL log the error with operation context and requestId
12. WHEN any error occurs, THE Voice_Service SHALL log the error with operation context and requestId

### Requirement 11: Performance and Resource Limits

**User Story:** As a system administrator, I want predictable resource usage and timeout behavior, so that the system scales reliably and costs remain controlled.

#### Acceptance Criteria

1. THE Copilot_Service SHALL have a maximum execution timeout of 60 seconds
2. THE Copilot_Service SHALL have a memory allocation of 1024 MB
3. THE Voice_Service SHALL have a maximum execution timeout of 120 seconds
4. THE Voice_Service SHALL have a memory allocation of 1024 MB
5. WHEN calling Bedrock_Client, THE Copilot_Service SHALL request a maximum of 1000 tokens
6. WHEN calling Bedrock_Client, THE Copilot_Service SHALL use a temperature of 0.1 for consistent parsing
7. THE Voice_Service SHALL wait a maximum of 15 seconds for transcription job completion

### Requirement 12: Audio Format Support

**User Story:** As a driver, I want to submit audio in standard formats, so that I can use voice input from various devices and recording methods.

#### Acceptance Criteria

1. WHEN a voice request includes a "contentType" field, THE Voice_Service SHALL use the provided content type for S3 storage
2. WHEN a voice request omits the "contentType" field, THE Voice_Service SHALL default to "audio/wav"
3. WHEN uploading to S3, THE Voice_Service SHALL set the Content-Type metadata to the specified audio format
4. WHEN starting a transcription job, THE Voice_Service SHALL specify "wav" as the media format

### Requirement 13: Data Privacy and Storage

**User Story:** As a system administrator, I want voice recordings stored securely with driver-specific organization, so that we maintain data privacy and can audit usage if needed.

#### Acceptance Criteria

1. WHEN storing audio files, THE Voice_Service SHALL organize them by driver ID in the path structure "voice/{driverId}/"
2. WHEN storing audio files, THE Voice_Service SHALL include a timestamp in the filename for uniqueness
3. THE Voice_Service SHALL store audio files in the configured DOCUMENTS_BUCKET
4. THE Voice_Service SHALL store transcription outputs in the same DOCUMENTS_BUCKET

### Requirement 14: Bedrock Model Configuration

**User Story:** As a system administrator, I want the AI model configurable via environment variables, so that I can update or change models without code changes.

#### Acceptance Criteria

1. THE Copilot_Service SHALL read the Bedrock model ID from environment variable BEDROCK_MODEL_ID
2. WHEN BEDROCK_MODEL_ID is not set, THE Copilot_Service SHALL default to "anthropic.claude-3-haiku-20240307-v1:0"
3. THE Voice_Service SHALL read the Bedrock model ID from environment variable BEDROCK_MODEL_ID
4. WHEN BEDROCK_MODEL_ID is not set, THE Voice_Service SHALL default to "anthropic.claude-3-haiku-20240307-v1:0"
5. THE Copilot_Service SHALL use AWS region from environment variable AWS_REGION with default "us-east-1"
6. THE Voice_Service SHALL use AWS region from environment variable AWS_REGION with default "us-east-1"

### Requirement 15: Bedrock Prompt Engineering

**User Story:** As a system architect, I want the Bedrock prompt to enforce strict JSON output format, so that parsing is reliable and consistent across all requests.

#### Acceptance Criteria

1. WHEN calling Bedrock_Client, THE Copilot_Service SHALL provide a system prompt defining all required JSON fields
2. THE system prompt SHALL specify tripType as one of: "one_way", "round_trip", "open_ended", "backhaul", "multi_day"
3. THE system prompt SHALL specify equipment as one of: "Dry Van", "Reefer", "Flatbed", or null
4. THE system prompt SHALL include example inputs and outputs demonstrating correct parsing
5. THE system prompt SHALL instruct the model to return ONLY valid JSON with no additional text
6. THE system prompt SHALL define all fields as either string, number, array, or null types
7. THE Voice_Service SHALL use the same system prompt as the Copilot_Service for consistent parsing
