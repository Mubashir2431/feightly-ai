# Implementation Plan: Backend Infrastructure Setup

## Overview

This implementation plan sets up the complete backend infrastructure for feightly.ai using AWS CDK with TypeScript. The approach follows an incremental pattern: first establishing the infrastructure foundation (DynamoDB tables, S3 bucket), then implementing Lambda functions one by one with their corresponding API Gateway endpoints, and finally wiring everything together. Each Lambda function will be implemented with proper error handling, validation, and logging.

## Tasks

- [x] 1. Initialize AWS CDK project and configure base infrastructure
  - Create CDK project structure with TypeScript
  - Configure CDK app with us-east-1 region
  - Define stack with DynamoDB tables (Loads, Drivers, Negotiations, Documents, Bookings)
  - Create S3 bucket for document storage
  - Set up IAM roles and policies for Lambda execution
  - _Requirements: 1.1-1.20, 6.1-6.10_

- [x] 2. Set up API Gateway and shared Lambda utilities
  - Create API Gateway REST API with CORS configuration
  - Implement shared validation utilities for enum fields, numeric fields, and email format
  - Implement shared error response formatter
  - Implement shared DynamoDB client wrapper with error handling
  - Create TypeScript interfaces for all data models (Load, Driver, Negotiation, Document, Booking)
  - _Requirements: 6.7, 7.6, 7.7, 7.8, 8.1, 8.2, 8.5, 8.7_

- [ ]* 2.1 Write property tests for validation utilities
  - **Property 21: Enum field validation**
  - **Property 22: Numeric field validation**

  
  - **Property 23: Email format validation**
  - **Validates: Requirements 7.6, 7.7, 7.8, 7.9**

- [ ] 2.2 Write unit tests for error response formatter
  - Test 400, 404, 500, 503 error formatting
  - Test error response structure includes code, message, requestId
  - _Requirements: 8.2_

- [x] 3. Implement Load Search Lambda (GET /loads)
  - [x] 3.1 Create Lambda function with query parameter parsing
    - Parse originCity, destCity, equipment, minRate, maxDeadhead, bookingType parameters
    - Implement DynamoDB scan with filter expressions
    - Implement distance calculation for maxDeadhead filtering
    - Return filtered results with pagination support
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  
  - [ ]* 3.2 Write property tests for load search filtering
    - **Property 1: Query parameter filtering correctness**
    - **Property 2: Available loads only**
    - **Property 3: Distance-based filtering**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
  
  - [ ]* 3.3 Write unit tests for load search edge cases
    - Test empty results return empty array with 200 status
    - Test invalid query parameters return 400 error
    - _Requirements: 7.1, 8.6_
  
  - [x] 3.4 Wire Load Search Lambda to API Gateway
    - Create /loads resource and GET method
    - Configure request validation for query parameters
    - Set Lambda timeout to 30 seconds, memory to 512 MB
    - _Requirements: 6.9, 6.10_

- [x] 4. Implement Load Detail Lambda (GET /loads/{loadId})
  - [x] 4.1 Create Lambda function for single load retrieval
    - Parse loadId from path parameters
    - Query DynamoDB Loads table by partition key
    - Return 404 if load not found
    - Return complete load object if found
    - _Requirements: 2.10, 2.11_
  
  - [ ]* 4.2 Write property test for load retrieval
    - **Property 4: Load retrieval round-trip**
    - **Validates: Requirements 2.10**
  
  - [ ]* 4.3 Write unit tests for load detail edge cases
    - Test non-existent loadId returns 404
    - Test valid loadId returns complete load object
    - _Requirements: 2.11_
  
  - [x] 4.4 Wire Load Detail Lambda to API Gateway
    - Create /loads/{loadId} resource and GET method
    - Configure path parameter validation
    - _Requirements: 6.9_

- [x] 5. Checkpoint - Ensure load search and retrieval work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Book Load Lambda (POST /loads/{loadId}/book)
  - [x] 6.1 Create Lambda function for load booking
    - Parse loadId from path and driverId from request body
    - Implement DynamoDB transaction to atomically:
      - Check load exists and status = "available" (conditional update)
      - Create booking record with status "confirmed"
      - Update load status to "booked"
    - Generate rate confirmation document (PDF or text)
    - Upload document to S3
    - Create document record in Documents table
    - Return booking details with bookingId and rateConDocId
    - Handle concurrent booking attempts with 409 Conflict error
    - _Requirements: 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_
  
  - [ ]* 6.2 Write property tests for booking
    - **Property 5: Booking precondition enforcement**
    - **Property 6: Booking state consistency**
    - **Property 7: Booking response completeness**
    - **Property 8: Booking concurrency safety**
    - **Validates: Requirements 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
  
  - [ ]* 6.3 Write unit tests for booking edge cases
    - Test booking non-existent load returns 400
    - Test booking already-booked load returns 400
    - Test concurrent booking attempts (only one succeeds)
    - _Requirements: 3.3, 3.9_
  
  - [x] 6.4 Wire Book Load Lambda to API Gateway
    - Create /loads/{loadId}/book resource and POST method
    - Configure request body validation
    - Grant Lambda permissions for S3 write operations
    - _Requirements: 6.6, 6.9_

- [x] 7. Implement Negotiate Lambda (POST /negotiate)
  - [x] 7.1 Create Lambda function to start negotiation
    - Parse loadId, driverId, strategy from request body
    - Retrieve load and driver information from DynamoDB
    - Generate negotiationId (UUID)
    - Create negotiation record with status "in_progress", currentRound = 1
    - Build Bedrock prompt with load details, market rates, strategy
    - Call Amazon Bedrock (Claude 3 Haiku) to generate first negotiation email
    - Store first offer in negotiation record
    - Send email to n8n webhook URL
    - Return negotiationId and initial offer details
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  
  - [ ]* 7.2 Write property tests for negotiation initialization
    - **Property 9: Negotiation initialization**
    - **Property 10: Negotiation response structure**
    - **Property 11: Bedrock integration for initial offer**
    - **Property 12: Webhook notification**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7**
  
  - [ ]* 7.3 Write unit tests for negotiation edge cases
    - Test negotiation with invalid loadId returns 400
    - Test negotiation with invalid strategy returns 400
    - Test Bedrock failure returns 503
    - _Requirements: 7.4, 7.9_
  
  - [x] 7.4 Wire Negotiate Lambda to API Gateway
    - Create /negotiate resource and POST method
    - Configure request body validation
    - Grant Lambda permissions for Bedrock API access
    - Set Lambda timeout to 60 seconds for Bedrock calls
    - _Requirements: 6.6, 6.10_

- [x] 8. Implement Broker Response Lambda (POST /negotiations/{negotiationId}/broker-response)
  - [x] 8.1 Create Lambda function to handle broker responses
    - Parse negotiationId from path and broker response from body
    - Retrieve negotiation record from DynamoDB
    - Parse broker's response to extract counter-offer amount
    - Increment currentRound
    - Add broker's offer to offers list
    - Implement decision logic:
      - If broker accepts OR counter-offer >= driverMinRate: update status to "accepted", create booking
      - Else if currentRound < maxRounds: call Bedrock for counter-offer, send to n8n
      - Else: update status to "walked_away"
    - Update negotiation record in DynamoDB
    - Return negotiation status and latest offer
    - _Requirements: 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15_
  
  - [ ]* 8.2 Write property tests for broker response handling
    - **Property 13: Broker acceptance handling**
    - **Property 14: Negotiation continuation**
    - **Property 15: Negotiation termination**
    - **Property 16: Offer history accumulation**
    - **Validates: Requirements 4.11, 4.12, 4.13, 4.14, 4.15**
  
  - [ ]* 8.3 Write unit tests for broker response edge cases
    - Test broker acceptance creates booking
    - Test negotiation walks away after maxRounds
    - Test offer history is correctly maintained
    - _Requirements: 4.11, 4.14, 4.15_
  
  - [x] 8.4 Wire Broker Response Lambda to API Gateway
    - Create /negotiations/{negotiationId}/broker-response resource and POST method
    - Configure request body validation
    - _Requirements: 6.9_

- [x] 9. Implement Negotiation Status Lambda (GET /negotiations/{negotiationId})
  - [x] 9.1 Create Lambda function to retrieve negotiation status
    - Parse negotiationId from path parameters
    - Query DynamoDB Negotiations table
    - Return complete negotiation record with all offers
    - _Requirements: 4.17_
  
  - [ ]* 9.2 Write property test for negotiation retrieval
    - **Property 17: Negotiation retrieval round-trip**
    - **Validates: Requirements 4.17**
  
  - [x] 9.3 Wire Negotiation Status Lambda to API Gateway
    - Create /negotiations/{negotiationId} resource and GET method
    - Configure path parameter validation
    - _Requirements: 6.9_

- [x] 10. Checkpoint - Ensure booking and negotiation flows work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Driver Dashboard Lambda (GET /driver/{driverId}/dashboard)
  - [x] 11.1 Create Lambda function for dashboard metrics
    - Parse driverId from path parameters
    - Query Bookings table for all driver's bookings
    - Filter bookings with status "delivered"
    - Calculate totalEarnings (sum of finalRate × distanceMiles)
    - Calculate loadsCompleted (count of delivered bookings)
    - Calculate avgRate (totalEarnings / total miles)
    - Return dashboard metrics
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 11.2 Write property test for dashboard calculations
    - **Property 18: Dashboard metrics calculation**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**
  
  - [ ]* 11.3 Write unit tests for dashboard edge cases
    - Test driver with no bookings returns zero metrics
    - Test dashboard calculation with multiple bookings
    - _Requirements: 5.2, 5.3, 5.4_
  
  - [x] 11.4 Wire Driver Dashboard Lambda to API Gateway
    - Create /driver/{driverId}/dashboard resource and GET method
    - Configure path parameter validation
    - _Requirements: 6.9_

- [x] 12. Implement Driver Documents Lambda (GET /driver/{driverId}/documents)
  - [x] 12.1 Create Lambda function for document listing
    - Parse driverId from path parameters
    - Query Documents table for all driver's documents
    - For each document, generate presigned S3 URL (1 hour expiry)
    - Return list of documents with download URLs
    - _Requirements: 5.7, 5.8, 5.9_
  
  - [ ]* 12.2 Write property tests for document management
    - **Property 19: Driver document filtering**
    - **Property 20: Document response structure**
    - **Validates: Requirements 5.7, 5.8, 5.9**
  
  - [ ]* 12.3 Write unit tests for document edge cases
    - Test driver with no documents returns empty array
    - Test presigned URLs are valid and not expired
    - _Requirements: 5.7, 5.9_
  
  - [x] 12.4 Wire Driver Documents Lambda to API Gateway
    - Create /driver/{driverId}/documents resource and GET method
    - Configure path parameter validation
    - Grant Lambda permissions for S3 read operations
    - _Requirements: 6.6, 6.9_

- [x] 13. Implement comprehensive error handling across all Lambdas
  - Add try-catch blocks for DynamoDB operations (return 500 on failure)
  - Add try-catch blocks for S3 operations (return 500 on failure)
  - Add try-catch blocks for Bedrock operations (return 503 on failure)
  - Implement error logging with context (requestId, operation, error details)
  - Ensure all error responses follow standard format
  - _Requirements: 7.3, 7.4, 7.5, 8.2_

- [ ]* 13.1 Write property tests for error handling
  - **Property 24: Missing field validation**
  - **Property 25: Invalid parameter handling**
  - **Property 26: External service failure handling**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 14. Implement API response formatting standards
  - Ensure all successful responses return 200 with JSON body
  - Ensure all timestamps use ISO 8601 format
  - Ensure all field names use camelCase
  - Add requestId to all responses
  - Implement pagination metadata for load search endpoint
  - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.7_

- [ ]* 14.1 Write property tests for response formatting
  - **Property 27: Success response format**
  - **Property 28: Error response format**
  - **Property 29: Pagination metadata**
  - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.7**

- [x] 15. Configure Lambda environment variables and finalize CDK stack
  - Set environment variables for all Lambdas (table names, bucket name, Bedrock model ID, n8n webhook URL)
  - Configure Lambda timeouts (30s for most, 60s for Bedrock calls)
  - Configure Lambda memory (512 MB for most, 1024 MB for Bedrock calls)
  - Add CDK outputs for API Gateway URL and table names
  - _Requirements: 6.8, 6.10_

- [x] 16. Create deployment documentation and scripts
  - Create README with deployment instructions
  - Create deployment script (cdk deploy)
  - Document environment variables needed
  - Document API endpoints and request/response formats
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 17. Final checkpoint - Deploy and verify all endpoints
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and unit tests that can be skipped for faster MVP
- Each Lambda function is implemented incrementally with its API Gateway integration
- Checkpoints ensure validation at key milestones (after search/retrieval, after booking/negotiation, final deployment)
- All property tests reference specific design document properties for traceability
- Error handling and response formatting are implemented as cross-cutting concerns after core functionality
- The implementation uses AWS CDK with TypeScript for infrastructure and Lambda functions
