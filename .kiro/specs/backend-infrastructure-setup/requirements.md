# Requirements Document

## Introduction

This document specifies the requirements for the backend infrastructure setup of feightly.ai, an AI-powered trucking copilot mobile application for owner-operator truck drivers. The backend infrastructure includes AWS DynamoDB tables for data persistence, AWS Lambda functions for business logic, and AWS API Gateway for RESTful API endpoints. The system will support load searching, booking, autonomous negotiation with brokers, and document management.

## Glossary

- **System**: The feightly.ai backend infrastructure
- **Driver**: An owner-operator truck driver using the feightly.ai mobile app
- **Load**: A freight shipment opportunity with origin, destination, and rate information
- **Broker**: A freight broker offering loads to drivers
- **Negotiation**: An autonomous AI-powered negotiation process between a driver and broker
- **Booking**: A confirmed load assignment to a driver
- **Rate_Confirmation**: A document confirming the agreed rate and terms for a load
- **DynamoDB**: AWS NoSQL database service for data persistence
- **Lambda**: AWS serverless compute service for backend functions
- **API_Gateway**: AWS service for creating and managing REST APIs
- **Bedrock**: Amazon's AI service (Claude 3 Haiku) for generating negotiation emails
- **n8n**: Workflow automation platform for email handling
- **S3**: AWS object storage service for document storage

## Requirements

### Requirement 1: DynamoDB Table Schema

**User Story:** As a system architect, I want properly structured DynamoDB tables, so that the application can efficiently store and retrieve loads, drivers, negotiations, documents, and bookings.

#### Acceptance Criteria

1. THE System SHALL create a Loads table with loadId as partition key
2. THE Loads table SHALL store origin as a Map containing city, state, lat, lng, and address fields
3. THE Loads table SHALL store destination as a Map containing city, state, lat, lng, and address fields
4. THE Loads table SHALL store distanceMiles, weightLbs, postedRate, marketRateAvg, marketRateHigh, and marketRateLow as Number types
5. THE Loads table SHALL store equipment as a String with valid values "Dry Van", "Reefer", or "Flatbed"
6. THE Loads table SHALL store rateTrend as a String with valid values "rising", "falling", or "stable"
7. THE Loads table SHALL store bookingType as a String with valid values "book_now", "negotiable", or "hot"
8. THE Loads table SHALL store broker as a Map containing name, contact, email, phone, rating, paymentTerms, and onTimePayment fields
9. THE Loads table SHALL store status as a String with valid values "available", "booked", or "in_negotiation"
10. THE System SHALL create a Drivers table with driverId as partition key
11. THE Drivers table SHALL store homeBase and currentLocation as Maps containing city, state, lat, and lng fields
12. THE Drivers table SHALL store preferredLanes and avoidRegions as Lists of Strings
13. THE System SHALL create a Negotiations table with negotiationId as partition key
14. THE Negotiations table SHALL store strategy as a String with valid values "aggressive", "moderate", or "conservative"
15. THE Negotiations table SHALL store status as a String with valid values "in_progress", "accepted", "rejected", or "walked_away"
16. THE Negotiations table SHALL store offers as a List of Maps containing round, amount, sender, timestamp, and emailBody fields
17. THE System SHALL create a Documents table with docId as partition key
18. THE Documents table SHALL store docType as a String with valid values "rate_confirmation", "bol", "pod", or "invoice"
19. THE System SHALL create a Bookings table with bookingId as partition key
20. THE Bookings table SHALL store status as a String with valid values "confirmed", "in_transit", or "delivered"

### Requirement 2: Load Search and Retrieval

**User Story:** As a driver, I want to search for available loads based on my preferences, so that I can find suitable freight opportunities.

#### Acceptance Criteria

1. WHEN a GET request is made to /loads with query parameters, THE API_Gateway SHALL route the request to the Load_Search_Lambda
2. WHEN originCity query parameter is provided, THE Load_Search_Lambda SHALL filter loads by origin city
3. WHEN destCity query parameter is provided, THE Load_Search_Lambda SHALL filter loads by destination city
4. WHEN equipment query parameter is provided, THE Load_Search_Lambda SHALL filter loads by equipment type
5. WHEN minRate query parameter is provided, THE Load_Search_Lambda SHALL filter loads with postedRate greater than or equal to minRate
6. WHEN maxDeadhead query parameter is provided, THE Load_Search_Lambda SHALL filter loads based on distance from driver's current location
7. WHEN bookingType query parameter is provided, THE Load_Search_Lambda SHALL filter loads by booking type
8. THE Load_Search_Lambda SHALL return only loads with status "available"
9. WHEN a GET request is made to /loads/{loadId}, THE API_Gateway SHALL route the request to the Load_Detail_Lambda
10. THE Load_Detail_Lambda SHALL retrieve and return the complete load record from the Loads table
11. IF the loadId does not exist, THEN THE Load_Detail_Lambda SHALL return a 404 error with a descriptive message

### Requirement 3: Load Booking

**User Story:** As a driver, I want to book a load instantly, so that I can secure freight without negotiation.

#### Acceptance Criteria

1. WHEN a POST request is made to /loads/{loadId}/book with driverId in the request body, THE API_Gateway SHALL route the request to the Book_Load_Lambda
2. THE Book_Load_Lambda SHALL verify the load exists and has status "available"
3. IF the load does not exist or is not available, THEN THE Book_Load_Lambda SHALL return a 400 error with a descriptive message
4. THE Book_Load_Lambda SHALL create a new booking record in the Bookings table with status "confirmed"
5. THE Book_Load_Lambda SHALL update the load status to "booked" in the Loads table
6. THE Book_Load_Lambda SHALL generate a rate confirmation document and store it in S3
7. THE Book_Load_Lambda SHALL create a document record in the Documents table with docType "rate_confirmation"
8. THE Book_Load_Lambda SHALL return the booking details including bookingId and rateConDocId
9. WHEN multiple concurrent booking requests are made for the same load, THE System SHALL ensure only one booking succeeds

### Requirement 4: Autonomous Negotiation

**User Story:** As a driver, I want the system to autonomously negotiate rates with brokers on my behalf, so that I can get better rates without manual back-and-forth.

#### Acceptance Criteria

1. WHEN a POST request is made to /negotiate with loadId, driverId, and strategy in the request body, THE API_Gateway SHALL route the request to the Negotiate_Lambda
2. THE Negotiate_Lambda SHALL retrieve the load and driver information from DynamoDB
3. THE Negotiate_Lambda SHALL create a negotiation record in the Negotiations table with status "in_progress"
4. THE Negotiate_Lambda SHALL call Amazon Bedrock with the load details, market rates, and strategy to generate the first negotiation email
5. THE Negotiate_Lambda SHALL send the generated email to the n8n webhook URL for delivery to the broker
6. THE Negotiate_Lambda SHALL store the first offer in the negotiation record
7. THE Negotiate_Lambda SHALL return the negotiationId and initial offer details
8. WHEN a POST request is made to /negotiations/{negotiationId}/broker-response with the broker's reply, THE API_Gateway SHALL route the request to the Broker_Response_Lambda
9. THE Broker_Response_Lambda SHALL retrieve the negotiation record from DynamoDB
10. THE Broker_Response_Lambda SHALL parse the broker's response to extract the counter-offer amount
11. IF the broker accepts the driver's rate, THEN THE Broker_Response_Lambda SHALL update negotiation status to "accepted" and create a booking
12. IF the broker's counter-offer meets or exceeds the driver's minimum rate, THEN THE Broker_Response_Lambda SHALL update negotiation status to "accepted" and create a booking
13. IF the current round is less than maxRounds and the counter-offer is below the driver's minimum, THEN THE Broker_Response_Lambda SHALL call Bedrock to generate a counter-offer email
14. IF the current round equals maxRounds and the counter-offer is below the driver's minimum, THEN THE Broker_Response_Lambda SHALL update negotiation status to "walked_away"
15. THE Broker_Response_Lambda SHALL update the offers list in the negotiation record with each new exchange
16. WHEN a GET request is made to /negotiations/{negotiationId}, THE API_Gateway SHALL route the request to the Negotiation_Status_Lambda
17. THE Negotiation_Status_Lambda SHALL retrieve and return the complete negotiation record including all offers and current status

### Requirement 5: Driver Dashboard and Documents

**User Story:** As a driver, I want to view my performance metrics and access my documents, so that I can track my business and manage paperwork.

#### Acceptance Criteria

1. WHEN a GET request is made to /driver/{driverId}/dashboard, THE API_Gateway SHALL route the request to the Driver_Dashboard_Lambda
2. THE Driver_Dashboard_Lambda SHALL query the Bookings table to calculate total earnings for the driver
3. THE Driver_Dashboard_Lambda SHALL query the Bookings table to count completed loads for the driver
4. THE Driver_Dashboard_Lambda SHALL calculate the average rate per mile across all completed bookings
5. THE Driver_Dashboard_Lambda SHALL return dashboard metrics including totalEarnings, loadsCompleted, and avgRate
6. WHEN a GET request is made to /driver/{driverId}/documents, THE API_Gateway SHALL route the request to the Driver_Documents_Lambda
7. THE Driver_Documents_Lambda SHALL query the Documents table for all documents associated with the driverId
8. THE Driver_Documents_Lambda SHALL return a list of documents with docId, docType, loadId, and createdAt
9. THE Driver_Documents_Lambda SHALL generate presigned S3 URLs for document download

### Requirement 6: Infrastructure as Code

**User Story:** As a DevOps engineer, I want the infrastructure defined as code, so that I can deploy and manage the backend consistently and repeatably.

#### Acceptance Criteria

1. THE System SHALL define all DynamoDB tables using AWS CDK or SAM templates
2. THE System SHALL define all Lambda functions using AWS CDK or SAM templates
3. THE System SHALL define the API Gateway REST API using AWS CDK or SAM templates
4. THE System SHALL configure all Lambda functions to use Node.js 18 runtime
5. THE System SHALL deploy all resources to the us-east-1 region
6. THE System SHALL configure appropriate IAM roles and policies for Lambda functions to access DynamoDB, S3, and Bedrock
7. THE System SHALL configure API Gateway CORS settings to allow requests from the Expo mobile app
8. THE System SHALL configure Lambda environment variables for DynamoDB table names, S3 bucket name, and Bedrock model ID
9. THE System SHALL configure API Gateway request validation for required parameters
10. THE System SHALL configure appropriate Lambda timeout and memory settings for each function

### Requirement 7: Error Handling and Validation

**User Story:** As a system administrator, I want robust error handling and input validation, so that the system provides clear feedback and maintains data integrity.

#### Acceptance Criteria

1. WHEN invalid query parameters are provided to any endpoint, THEN THE System SHALL return a 400 error with a descriptive message
2. WHEN a required field is missing from a request body, THEN THE System SHALL return a 400 error listing the missing fields
3. WHEN a DynamoDB operation fails, THEN THE Lambda SHALL log the error and return a 500 error with a generic message
4. WHEN a Bedrock API call fails, THEN THE Lambda SHALL log the error and return a 503 error indicating the AI service is unavailable
5. WHEN an S3 operation fails, THEN THE Lambda SHALL log the error and return a 500 error with a descriptive message
6. THE System SHALL validate that equipment values are one of "Dry Van", "Reefer", or "Flatbed"
7. THE System SHALL validate that numeric fields (rates, distances, weights) are positive numbers
8. THE System SHALL validate that email addresses in broker information follow standard email format
9. THE System SHALL validate that negotiation strategy is one of "aggressive", "moderate", or "conservative"
10. WHEN a Lambda function exceeds its timeout, THEN THE System SHALL return a 504 error

### Requirement 8: API Response Format

**User Story:** As a mobile app developer, I want consistent API response formats, so that I can reliably parse and display data in the app.

#### Acceptance Criteria

1. THE System SHALL return all successful responses with HTTP status 200 and a JSON body
2. THE System SHALL return all error responses with appropriate HTTP status codes (400, 404, 500, 503, 504) and a JSON body containing an error message
3. THE System SHALL format all timestamps in ISO 8601 format
4. THE System SHALL include pagination metadata (nextToken, hasMore) for list endpoints that may return large result sets
5. THE System SHALL return consistent field names using camelCase convention
6. WHEN a list endpoint returns no results, THEN THE System SHALL return an empty array with HTTP status 200
7. THE System SHALL include request IDs in all responses for debugging and tracing
