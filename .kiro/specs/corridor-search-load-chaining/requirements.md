# Requirements Document

## Introduction

The Corridor Search & Load Chaining feature is the core differentiator for feightly.ai, enabling drivers to find profitable multi-leg load chains when no direct loads exist at good rates. This intelligent search system analyzes geographic corridors, calculates optimal load chains, and provides AI-powered recommendations to maximize driver revenue.

Unlike traditional load boards that only show direct loads, this feature identifies opportunities to chain 2-3 loads together along a route, turning unprofitable trips into profitable ones. It also includes a broker simulator for testing negotiation flows.

## Glossary

- **Corridor_Search_Lambda**: The Lambda function that handles intelligent load searching with multiple search modes
- **Broker_Simulator_Lambda**: The Lambda function that simulates realistic broker negotiation responses
- **Load_Chain**: A sequence of 2-3 loads that can be completed along a geographic corridor from origin to final destination
- **Corridor**: A geographic band extending from an origin point to a destination point, typically 75 miles wide
- **Deadhead_Miles**: Empty miles driven without cargo to reach the next load pickup
- **Trip_Score**: A calculated metric evaluating the profitability of a single load
- **Chain_Score**: A calculated metric evaluating the profitability of a multi-leg load chain
- **Search_Mode**: The type of search being performed (one_way, corridor_chain, open_ended, backhaul, round_trip)
- **Toward_Direction**: A load destination that moves closer to the final destination (reduces remaining distance by at least 20%)
- **Market_Rate**: The average rate for a load on a specific lane based on market data
- **Posted_Rate**: The rate advertised by the broker for a load
- **Driver_Offer**: The rate a driver proposes during negotiation

## Requirements

### Requirement 1: Corridor Search Lambda Endpoint

**User Story:** As a driver, I want to search for loads using intelligent algorithms, so that I can find profitable load chains when direct loads are not available.

#### Acceptance Criteria

1. THE Corridor_Search_Lambda SHALL accept POST requests at /loads/smart-search endpoint
2. WHEN a search request is received, THE Corridor_Search_Lambda SHALL validate the request body contains required fields (searchMode, origin, destination, equipment, driverId)
3. WHEN validation fails, THE Corridor_Search_Lambda SHALL return a 400 error with descriptive error message
4. WHEN a search request is received, THE Corridor_Search_Lambda SHALL retrieve the driver's current location from the Drivers table
5. WHEN the driver is not found, THE Corridor_Search_Lambda SHALL return a 404 error
6. THE Corridor_Search_Lambda SHALL support five search modes: one_way, corridor_chain, open_ended, backhaul, round_trip
7. WHEN an invalid search mode is provided, THE Corridor_Search_Lambda SHALL return a 400 error
8. THE Corridor_Search_Lambda SHALL return results with status code 200 and include loads, chains, recommendations, and metadata

### Requirement 2: One-Way Search Mode

**User Story:** As a driver, I want to search for direct loads first and see corridor chains only if direct loads are poor, so that I can prioritize simple trips when they are profitable.

#### Acceptance Criteria

1. WHEN searchMode is "one_way", THE Corridor_Search_Lambda SHALL first search for direct loads from origin to destination
2. WHEN searching for direct loads, THE Corridor_Search_Lambda SHALL filter loads within 50 miles of origin and within 50 miles of destination
3. WHEN direct loads are found, THE Corridor_Search_Lambda SHALL calculate trip scores for each load
4. WHEN the best direct load has a trip score above 7.0, THE Corridor_Search_Lambda SHALL return only direct loads
5. WHEN no direct loads exist or all direct loads have trip scores below 7.0, THE Corridor_Search_Lambda SHALL execute corridor chain search
6. THE Corridor_Search_Lambda SHALL include a recommendation explaining why direct loads or chains were chosen

### Requirement 3: Corridor Chain Search Algorithm

**User Story:** As a driver, I want the system to find multi-leg load chains along my route, so that I can turn unprofitable trips into profitable ones by chaining loads together.

#### Acceptance Criteria

1. WHEN corridor chain search is executed, THE Corridor_Search_Lambda SHALL define a corridor as a geographic band from origin to destination
2. WHEN finding first-leg loads, THE Corridor_Search_Lambda SHALL search for loads within 75 miles of the origin
3. WHEN evaluating first-leg loads, THE Corridor_Search_Lambda SHALL filter loads whose destinations are "toward" the final destination
4. WHEN determining if a destination is "toward" the final destination, THE Corridor_Search_Lambda SHALL verify the destination reduces remaining distance by at least 20%
5. WHEN a first-leg load is found, THE Corridor_Search_Lambda SHALL recursively search for second-leg loads from the first-leg destination
6. WHEN searching for subsequent legs, THE Corridor_Search_Lambda SHALL limit chains to a maximum of 3 legs
7. WHEN a load chain is complete, THE Corridor_Search_Lambda SHALL calculate total deadhead miles as the sum of deadhead between each leg
8. WHEN a load chain is complete, THE Corridor_Search_Lambda SHALL calculate the chain score using the weighted formula
9. THE Corridor_Search_Lambda SHALL return up to 10 highest-scoring load chains

### Requirement 4: Open-Ended Search Mode

**User Story:** As a driver, I want to see all available loads within my deadhead range grouped by region, so that I can explore opportunities in any direction.

#### Acceptance Criteria

1. WHEN searchMode is "open_ended", THE Corridor_Search_Lambda SHALL search for all loads within maxDeadhead miles of the driver's current location
2. WHEN maxDeadhead is not provided, THE Corridor_Search_Lambda SHALL use a default value of 100 miles
3. WHEN loads are found, THE Corridor_Search_Lambda SHALL group loads by destination region (state or metro area)
4. WHEN grouping loads, THE Corridor_Search_Lambda SHALL calculate average trip score for each region
5. THE Corridor_Search_Lambda SHALL sort regions by average trip score in descending order
6. THE Corridor_Search_Lambda SHALL return loads grouped by region with region statistics

### Requirement 5: Backhaul Search Mode

**User Story:** As a driver, I want to search for loads that take me back toward my home base, so that I can avoid deadheading home empty.

#### Acceptance Criteria

1. WHEN searchMode is "backhaul", THE Corridor_Search_Lambda SHALL retrieve the driver's home base location from the Drivers table
2. WHEN searching for backhaul loads, THE Corridor_Search_Lambda SHALL search for loads within 75 miles of the driver's current location
3. WHEN evaluating backhaul loads, THE Corridor_Search_Lambda SHALL filter loads whose destinations are within 100 miles of the driver's home base
4. WHEN no direct backhaul loads exist, THE Corridor_Search_Lambda SHALL search for triangle routes (current location → intermediate point → home base)
5. WHEN searching for triangle routes, THE Corridor_Search_Lambda SHALL limit the intermediate point to locations that reduce distance to home by at least 30%
6. THE Corridor_Search_Lambda SHALL calculate trip scores for backhaul loads and chain scores for triangle routes
7. THE Corridor_Search_Lambda SHALL return backhaul loads and triangle routes sorted by score

### Requirement 6: Round-Trip Search Mode

**User Story:** As a driver, I want to find round-trip opportunities combining an outbound load and a return load, so that I can maximize revenue on both legs of my trip.

#### Acceptance Criteria

1. WHEN searchMode is "round_trip", THE Corridor_Search_Lambda SHALL search for outbound loads from origin to destination
2. WHEN outbound loads are found, THE Corridor_Search_Lambda SHALL search for return loads from destination back toward origin
3. WHEN evaluating return loads, THE Corridor_Search_Lambda SHALL filter loads whose destinations are within 75 miles of the origin
4. WHEN a round-trip pair is found, THE Corridor_Search_Lambda SHALL calculate combined revenue as the sum of both load rates
5. WHEN a round-trip pair is found, THE Corridor_Search_Lambda SHALL calculate total miles as the sum of both load distances plus deadhead miles
6. WHEN a round-trip pair is found, THE Corridor_Search_Lambda SHALL calculate round-trip score using the combined revenue and total miles
7. THE Corridor_Search_Lambda SHALL return up to 10 highest-scoring round-trip pairs

### Requirement 7: Trip Score Calculation

**User Story:** As a driver, I want loads to be scored based on profitability metrics, so that I can quickly identify the best opportunities.

#### Acceptance Criteria

1. WHEN calculating trip score for a load, THE Corridor_Search_Lambda SHALL use the formula: (rateWeight × rateScore) + (deadheadWeight × deadheadScore) + (marketWeight × marketScore)
2. WHEN calculating rate score, THE Corridor_Search_Lambda SHALL normalize postedRate by dividing by distanceMiles and scaling to 0-10 range
3. WHEN calculating deadhead score, THE Corridor_Search_Lambda SHALL assign 10 points for 0 deadhead miles and decrease linearly to 0 points at 200 miles
4. WHEN calculating market score, THE Corridor_Search_Lambda SHALL compare postedRate to marketRateAvg and scale to 0-10 range
5. THE Corridor_Search_Lambda SHALL use weights: rateWeight = 0.5, deadheadWeight = 0.3, marketWeight = 0.2
6. WHEN postedRate exceeds marketRateAvg by 20% or more, THE Corridor_Search_Lambda SHALL assign market score of 10
7. WHEN postedRate is below marketRateAvg by 20% or more, THE Corridor_Search_Lambda SHALL assign market score of 0

### Requirement 8: Chain Score Calculation

**User Story:** As a driver, I want load chains to be scored based on overall profitability, so that I can compare chains against direct loads.

#### Acceptance Criteria

1. WHEN calculating chain score, THE Corridor_Search_Lambda SHALL use the formula: (totalRevenue / totalMiles × revenueWeight) + (avgMarketScore × marketWeight) - (deadheadPenalty × deadheadWeight)
2. WHEN calculating total revenue, THE Corridor_Search_Lambda SHALL sum the postedRate of all loads in the chain
3. WHEN calculating total miles, THE Corridor_Search_Lambda SHALL sum the distanceMiles of all loads plus total deadhead miles
4. WHEN calculating average market score, THE Corridor_Search_Lambda SHALL average the market scores of all loads in the chain
5. WHEN calculating deadhead penalty, THE Corridor_Search_Lambda SHALL assign 1 point per 10 deadhead miles
6. THE Corridor_Search_Lambda SHALL use weights: revenueWeight = 0.6, marketWeight = 0.2, deadheadWeight = 0.2
7. WHEN a chain score is calculated, THE Corridor_Search_Lambda SHALL normalize the score to a 0-10 range

### Requirement 9: AI Recommendations

**User Story:** As a driver, I want to receive AI-generated recommendations explaining search results, so that I can understand why certain loads or chains are suggested.

#### Acceptance Criteria

1. WHEN search results are returned, THE Corridor_Search_Lambda SHALL generate a recommendation message
2. WHEN direct loads are available with high scores, THE Corridor_Search_Lambda SHALL recommend taking the direct load
3. WHEN chains score higher than direct loads, THE Corridor_Search_Lambda SHALL recommend the chain and explain the revenue benefit
4. WHEN no good options exist, THE Corridor_Search_Lambda SHALL recommend waiting or expanding search radius
5. THE Corridor_Search_Lambda SHALL include specific metrics in recommendations (revenue per mile, total deadhead, market comparison)
6. WHEN multiple chains exist, THE Corridor_Search_Lambda SHALL highlight the top 3 chains with brief explanations

### Requirement 10: Broker Simulator Lambda Endpoint

**User Story:** As a developer, I want to simulate broker negotiation responses, so that I can test the negotiation flow without real brokers.

#### Acceptance Criteria

1. THE Broker_Simulator_Lambda SHALL accept POST requests at /simulate-broker-response endpoint
2. WHEN a simulation request is received, THE Broker_Simulator_Lambda SHALL validate the request body contains required fields (driverOffer, postedRate, marketRate, round)
3. WHEN validation fails, THE Broker_Simulator_Lambda SHALL return a 400 error with descriptive error message
4. THE Broker_Simulator_Lambda SHALL return a response with action, brokerOffer, message, and delaySeconds fields
5. THE Broker_Simulator_Lambda SHALL return status code 200 for successful simulations

### Requirement 11: Broker Simulator Logic

**User Story:** As a developer, I want the broker simulator to behave realistically based on offer amounts, so that I can test various negotiation scenarios.

#### Acceptance Criteria

1. WHEN the driver offer is at or above the posted rate, THE Broker_Simulator_Lambda SHALL return action "accept"
2. WHEN the driver offer is between 90% and 100% of posted rate, THE Broker_Simulator_Lambda SHALL return action "accept" with 80% probability
3. WHEN the driver offer is between 90% and 100% of posted rate and not accepted, THE Broker_Simulator_Lambda SHALL return action "counter" with broker offer at 95% of posted rate
4. WHEN the driver offer is between 75% and 90% of posted rate, THE Broker_Simulator_Lambda SHALL return action "counter" with broker offer halfway between driver offer and posted rate
5. WHEN the driver offer is below 75% of posted rate, THE Broker_Simulator_Lambda SHALL return action "reject"
6. WHEN the round number is 3 or higher, THE Broker_Simulator_Lambda SHALL increase rejection probability by 20% per round
7. WHEN action is "accept", THE Broker_Simulator_Lambda SHALL set delaySeconds between 5 and 30 seconds
8. WHEN action is "counter", THE Broker_Simulator_Lambda SHALL set delaySeconds between 30 and 120 seconds
9. WHEN action is "reject", THE Broker_Simulator_Lambda SHALL set delaySeconds between 10 and 60 seconds

### Requirement 12: Broker Simulator Messages

**User Story:** As a developer, I want the broker simulator to return realistic messages, so that the simulation feels authentic.

#### Acceptance Criteria

1. WHEN action is "accept", THE Broker_Simulator_Lambda SHALL return a message confirming acceptance
2. WHEN action is "counter", THE Broker_Simulator_Lambda SHALL return a message with the counter offer and brief justification
3. WHEN action is "reject", THE Broker_Simulator_Lambda SHALL return a message explaining the rejection
4. THE Broker_Simulator_Lambda SHALL vary message templates to avoid repetition
5. WHEN the driver offer is close to market rate, THE Broker_Simulator_Lambda SHALL mention market conditions in the message

### Requirement 13: Error Handling

**User Story:** As a developer, I want comprehensive error handling, so that failures are logged and users receive helpful error messages.

#### Acceptance Criteria

1. WHEN a DynamoDB operation fails, THE Corridor_Search_Lambda SHALL log the error with context and return a 500 error
2. WHEN a validation error occurs, THE Corridor_Search_Lambda SHALL return a 400 error with specific field information
3. WHEN an unexpected error occurs, THE Corridor_Search_Lambda SHALL log the full error stack and return a generic 500 error
4. THE Corridor_Search_Lambda SHALL include requestId in all error responses for traceability
5. THE Broker_Simulator_Lambda SHALL handle invalid numeric inputs and return 400 errors with descriptive messages

### Requirement 14: Performance and Limits

**User Story:** As a system administrator, I want the search to complete quickly and respect resource limits, so that the system remains responsive under load.

#### Acceptance Criteria

1. WHEN searching for loads, THE Corridor_Search_Lambda SHALL limit DynamoDB scans to 1000 items per scan operation
2. WHEN building load chains, THE Corridor_Search_Lambda SHALL limit chain exploration to 3 legs maximum
3. WHEN returning results, THE Corridor_Search_Lambda SHALL limit direct loads to 20 results
4. WHEN returning results, THE Corridor_Search_Lambda SHALL limit load chains to 10 results
5. THE Corridor_Search_Lambda SHALL complete searches within 5 seconds for typical requests
6. WHEN a search exceeds 5 seconds, THE Corridor_Search_Lambda SHALL log a performance warning

### Requirement 15: CDK Infrastructure

**User Story:** As a developer, I want the Lambda functions deployed via CDK, so that infrastructure is version-controlled and reproducible.

#### Acceptance Criteria

1. THE CDK stack SHALL define the Corridor_Search_Lambda with Node.js 18 runtime
2. THE CDK stack SHALL define the Broker_Simulator_Lambda with Node.js 18 runtime
3. THE CDK stack SHALL grant both Lambdas read access to the Feightly-Loads DynamoDB table
4. THE CDK stack SHALL grant Corridor_Search_Lambda read access to the Feightly-Drivers DynamoDB table
5. THE CDK stack SHALL configure API Gateway routes for POST /loads/smart-search and POST /simulate-broker-response
6. THE CDK stack SHALL set Lambda timeout to 10 seconds
7. THE CDK stack SHALL set Lambda memory to 512 MB
8. THE CDK stack SHALL pass table names as environment variables to the Lambdas
