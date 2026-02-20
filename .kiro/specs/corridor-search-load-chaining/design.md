# Design Document: Corridor Search & Load Chaining

## Overview

The Corridor Search & Load Chaining feature implements feightly.ai's core competitive advantage: intelligent multi-leg load chain discovery. This system goes beyond traditional load boards by finding profitable combinations of 2-3 loads along a geographic corridor when no direct loads exist at good rates.

The design consists of two Lambda functions:

1. **Corridor Search Lambda** - Implements five search modes with sophisticated algorithms for finding and scoring load chains
2. **Broker Simulator Lambda** - Simulates realistic broker negotiation behavior for testing

### Key Design Principles

- **Incremental complexity**: Start with direct loads, escalate to chains only when needed
- **Geographic intelligence**: Use corridor-based search to find loads "toward" the destination
- **Scoring transparency**: Provide clear metrics so drivers understand recommendations
- **Realistic simulation**: Broker simulator uses probability-based logic matching real-world behavior

## Architecture

### System Components

```
┌─────────────────┐
│   API Gateway   │
└────────┬────────┘
         │
         ├─────────────────────────────────────┐
         │                                     │
         ▼                                     ▼
┌────────────────────┐              ┌──────────────────────┐
│ Corridor Search    │              │ Broker Simulator     │
│ Lambda             │              │ Lambda               │
│                    │              │                      │
│ - 5 search modes   │              │ - Probability logic  │
│ - Chain algorithm  │              │ - Realistic messages │
│ - Scoring engine   │              │                      │
└─────────┬──────────┘              └──────────────────────┘
          │
          ▼
┌─────────────────────┐
│   DynamoDB Tables   │
│                     │
│ - Feightly-Loads    │
│ - Feightly-Drivers  │
└─────────────────────┘
```

### Data Flow

1. **Request arrives** at API Gateway (POST /loads/smart-search)
2. **Lambda validates** request body and retrieves driver data
3. **Search mode router** directs to appropriate search algorithm
4. **Algorithm executes** (direct search, corridor chain, open-ended, backhaul, or round-trip)
5. **Scoring engine** calculates trip scores and chain scores
6. **Recommendation generator** creates AI insights
7. **Response returned** with loads, chains, recommendations, and metadata

## Components and Interfaces

### Corridor Search Lambda

**Endpoint**: POST /loads/smart-search

**Request Body**:
```typescript
interface SmartSearchRequest {
  searchMode: 'one_way' | 'corridor_chain' | 'open_ended' | 'backhaul' | 'round_trip';
  origin: {
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  destination?: {  // Optional for open_ended mode
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  equipment: 'Dry Van' | 'Reefer' | 'Flatbed';
  driverId: string;
  maxDeadhead?: number;  // Default: 100 miles
  minTripScore?: number;  // Default: 5.0
}
```

**Response Body**:
```typescript
interface SmartSearchResponse {
  searchMode: string;
  directLoads: LoadWithScore[];
  chains: LoadChain[];
  recommendations: {
    primary: string;
    insights: string[];
    topChains?: ChainSummary[];
  };
  metadata: {
    searchTime: number;
    loadsScanned: number;
    chainsEvaluated: number;
    driverLocation: LocationBase;
  };
}

interface LoadWithScore {
  load: Load;
  tripScore: number;
  deadheadMiles: number;
  revenuePerMile: number;
  marketComparison: string;  // "above", "at", "below"
}

interface LoadChain {
  chainId: string;
  legs: LoadWithScore[];
  chainScore: number;
  totalRevenue: number;
  totalMiles: number;
  totalDeadhead: number;
  revenuePerMile: number;
  summary: string;
}

interface ChainSummary {
  chainId: string;
  legCount: number;
  totalRevenue: number;
  revenuePerMile: number;
  reason: string;
}
```

### Broker Simulator Lambda

**Endpoint**: POST /simulate-broker-response

**Request Body**:
```typescript
interface BrokerSimulationRequest {
  driverOffer: number;
  postedRate: number;
  marketRate: number;
  round: number;
}
```

**Response Body**:
```typescript
interface BrokerSimulationResponse {
  action: 'accept' | 'counter' | 'reject';
  brokerOffer?: number;  // Present when action is 'counter'
  message: string;
  delaySeconds: number;
}
```

### Core Algorithms

#### 1. Corridor Chain Search Algorithm

```typescript
function findCorridorChains(
  origin: Location,
  destination: Location,
  equipment: EquipmentType,
  maxLegs: number = 3
): LoadChain[]

// Pseudocode:
// 1. Define corridor from origin to destination
// 2. Find first-leg loads within 75 miles of origin
// 3. Filter first-leg loads where destination is "toward" final destination
// 4. For each first-leg load:
//    a. Recursively search for next leg from first-leg destination
//    b. Continue until reaching final destination or maxLegs
//    c. Calculate chain score
// 5. Return top 10 chains by score
```

**"Toward" Logic**:
A load destination is "toward" the final destination if:
```
distanceFromLoadDestToFinalDest < distanceFromLoadOriginToFinalDest * 0.8
```
This means the load must reduce remaining distance by at least 20%.

#### 2. Trip Score Calculation

```typescript
function calculateTripScore(
  load: Load,
  deadheadMiles: number
): number

// Formula:
tripScore = (rateScore * 0.5) + (deadheadScore * 0.3) + (marketScore * 0.2)

// Where:
rateScore = normalize(load.postedRate / load.distanceMiles, 1.5, 3.5, 0, 10)
deadheadScore = max(0, 10 - (deadheadMiles / 20))
marketScore = normalize(load.postedRate / load.marketRateAvg, 0.8, 1.2, 0, 10)
```

**Normalization function**:
```typescript
function normalize(value: number, min: number, max: number, outMin: number, outMax: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return outMin + ((clamped - min) / (max - min)) * (outMax - outMin);
}
```

#### 3. Chain Score Calculation

```typescript
function calculateChainScore(chain: LoadChain): number

// Formula:
chainScore = (revenuePerMile * 0.6) + (avgMarketScore * 0.2) - (deadheadPenalty * 0.2)

// Where:
revenuePerMile = totalRevenue / totalMiles
avgMarketScore = average of all leg market scores
deadheadPenalty = totalDeadhead / 10

// Normalize to 0-10 range:
chainScore = normalize(chainScore, 1.5, 3.0, 0, 10)
```

#### 4. Broker Simulator Logic

```typescript
function simulateBrokerResponse(
  driverOffer: number,
  postedRate: number,
  marketRate: number,
  round: number
): BrokerSimulationResponse

// Logic:
const offerRatio = driverOffer / postedRate;

if (offerRatio >= 1.0) {
  return { action: 'accept', message: '...', delaySeconds: random(5, 30) };
}

if (offerRatio >= 0.90) {
  // 80% accept, 20% counter (reduced by round penalty)
  const acceptProb = 0.8 - (round - 1) * 0.2;
  if (random() < acceptProb) {
    return { action: 'accept', message: '...', delaySeconds: random(5, 30) };
  } else {
    return {
      action: 'counter',
      brokerOffer: postedRate * 0.95,
      message: '...',
      delaySeconds: random(30, 120)
    };
  }
}

if (offerRatio >= 0.75) {
  // Counter halfway between
  return {
    action: 'counter',
    brokerOffer: (driverOffer + postedRate) / 2,
    message: '...',
    delaySeconds: random(30, 120)
  };
}

// Below 75% - reject
return { action: 'reject', message: '...', delaySeconds: random(10, 60) };
```

### Search Mode Implementations

#### ONE_WAY Mode

1. Search for direct loads (origin within 50mi, destination within 50mi)
2. Calculate trip scores for all direct loads
3. If best direct load score > 7.0, return direct loads only
4. Otherwise, execute corridor chain search
5. Return both direct loads and chains with recommendation

#### CORRIDOR_CHAIN Mode

1. Execute corridor chain search algorithm
2. Return top 10 chains sorted by chain score
3. Include recommendation highlighting best chain

#### OPEN_ENDED Mode

1. Search all loads within maxDeadhead of driver's current location
2. Group loads by destination state
3. Calculate average trip score per state
4. Sort states by average score
5. Return loads grouped by state with statistics

#### BACKHAUL Mode

1. Get driver's home base from Drivers table
2. Search loads within 75mi of current location
3. Filter loads with destinations within 100mi of home base
4. If no direct backhaul loads, search for triangle routes:
   - Find loads that reduce distance to home by 30%+
   - From those destinations, search for loads to home
5. Return backhaul loads and triangle routes sorted by score

#### ROUND_TRIP Mode

1. Search outbound loads from origin to destination (within 50mi)
2. For each outbound load, search return loads from destination area
3. Filter return loads with destinations within 75mi of origin
4. Calculate combined score: (totalRevenue / totalMiles) normalized
5. Return top 10 round-trip pairs sorted by combined score

## Data Models

### Extended Types

```typescript
interface LoadWithScore {
  load: Load;  // From shared/types.ts
  tripScore: number;
  deadheadMiles: number;
  revenuePerMile: number;
  marketComparison: 'above' | 'at' | 'below';
}

interface LoadChain {
  chainId: string;
  legs: LoadWithScore[];
  chainScore: number;
  totalRevenue: number;
  totalMiles: number;
  totalDeadhead: number;
  revenuePerMile: number;
  summary: string;
}

interface SearchMetadata {
  searchTime: number;
  loadsScanned: number;
  chainsEvaluated: number;
  driverLocation: LocationBase;
}

interface Recommendations {
  primary: string;
  insights: string[];
  topChains?: ChainSummary[];
}
```

### DynamoDB Access Patterns

**Loads Table Scan**:
- Filter: `status = 'available' AND equipment = :equipment`
- Post-filter: Geographic filtering by distance calculations

**Drivers Table Get**:
- Key: `driverId`
- Attributes needed: `currentLocation`, `homeBase`

## Correctness Properties

