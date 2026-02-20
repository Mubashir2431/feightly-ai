// Corridor Search Lambda - Smart load search with chain discovery
// POST /loads/smart-search

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    generateRequestId,
    internalServerError,
    logError,
    logInfo,
    successResponse,
} from './shared/response';
import { Driver, EquipmentType, Load, LocationBase } from './shared/types';
import { calculateDistance } from './shared/utils';

const { v4: uuidv4 } = require('uuid');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const LOADS_TABLE = process.env.LOADS_TABLE_NAME || 'Feightly-Loads';
const DRIVERS_TABLE = process.env.DRIVERS_TABLE_NAME || 'Feightly-Drivers';

// Configurable search parameters
const DIRECT_LOAD_RADIUS_MILES = 75; // Radius for matching direct loads to origin/destination
const CORRIDOR_SEARCH_RADIUS_MILES = 75; // Radius for finding loads in corridor
const MIN_TRIP_SCORE_THRESHOLD = 7.0; // Minimum score to prefer direct loads over chains
const TOWARD_DESTINATION_THRESHOLD = 0.8; // Load must reduce distance by 20% (1 - 0.8)
const SAVINGS_THRESHOLD = 50; // Dollar threshold for recommending chains over direct loads

// Scoring weights and parameters
const RATE_SCORE_MIN = 1.5; // Min rate per mile for normalization
const RATE_SCORE_MAX = 3.5; // Max rate per mile for normalization
const DEADHEAD_PENALTY_DIVISOR = 20; // Deadhead miles divided by this for score penalty
const MARKET_RATIO_MIN = 0.8; // Min market ratio for normalization
const MARKET_RATIO_MAX = 1.2; // Max market ratio for normalization
const RATE_WEIGHT = 0.5; // Weight for rate score in trip score
const DEADHEAD_WEIGHT = 0.3; // Weight for deadhead score in trip score
const MARKET_WEIGHT = 0.2; // Weight for market score in trip score

// Chain scoring parameters
const CHAIN_REVENUE_WEIGHT = 0.6; // Weight for revenue per mile in chain score
const CHAIN_MARKET_WEIGHT = 0.2; // Weight for market score in chain score
const CHAIN_DEADHEAD_WEIGHT = 0.2; // Weight for deadhead penalty in chain score
const CHAIN_DEADHEAD_PENALTY_DIVISOR = 10; // Deadhead miles divided by this for penalty
const CHAIN_SCORE_MIN = 1.5; // Min chain score for normalization
const CHAIN_SCORE_MAX = 3.0; // Max chain score for normalization

// City coordinate lookup for flat format requests
const CITY_COORDINATES: Record<string, {lat: number, lng: number}> = {
  'Dallas,TX': {lat: 32.7767, lng: -96.797},
  'Atlanta,GA': {lat: 33.749, lng: -84.388},
  'Chicago,IL': {lat: 41.8781, lng: -87.6298},
  'Philadelphia,PA': {lat: 39.9526, lng: -75.1652},
  'Miami,FL': {lat: 25.7617, lng: -80.1918},
  'Houston,TX': {lat: 29.7604, lng: -95.3698},
  'Memphis,TN': {lat: 35.1495, lng: -90.049},
  'Los Angeles,CA': {lat: 34.0522, lng: -118.2437},
  'Charlotte,NC': {lat: 35.2271, lng: -80.8431},
  'Jacksonville,FL': {lat: 30.3322, lng: -81.6557},
  'Nashville,TN': {lat: 36.1627, lng: -86.7816},
  'Indianapolis,IN': {lat: 39.7684, lng: -86.1581},
  'Kansas City,MO': {lat: 39.0997, lng: -94.5786},
  'Denver,CO': {lat: 39.7392, lng: -104.9903},
  'Phoenix,AZ': {lat: 33.4484, lng: -112.074},
  'New Orleans,LA': {lat: 29.9511, lng: -90.0715},
  'Little Rock,AR': {lat: 34.7465, lng: -92.2896},
  'Birmingham,AL': {lat: 33.5207, lng: -86.8025},
  'Richmond,VA': {lat: 37.5407, lng: -77.436},
  'Baltimore,MD': {lat: 39.2904, lng: -76.6122},
  'St. Louis,MO': {lat: 38.627, lng: -90.1994},
  'New York,NY': {lat: 40.7128, lng: -74.006},
};

// Request interface - supports both flat and nested formats
interface SmartSearchRequest {
  // Flat format (from copilot)
  originCity?: string;
  originState?: string;
  destCity?: string;
  destState?: string;
  equipment?: EquipmentType;
  minRate?: number;
  tripType?: string;
  driverId: string;
  maxDeadhead?: number;
  homeCity?: string;
  homeState?: string;
  
  // Nested format
  origin?: LocationBase;
  destination?: LocationBase;
  searchMode?: string;
}

interface LoadWithScore {
  load: Load;
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

interface MarketInsight {
  avgMarketRate: number;
  loadCount: number;
  recommendation: string;
  bestOption: 'direct' | 'chain' | 'none';
  savingsVsDirect?: number;
}

/**
 * Normalize value to 0-10 range
 */
function normalize(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 10;
}

/**
 * Calculate trip score for a single load
 */
function calculateTripScore(load: Load, deadheadMiles: number): number {
  const ratePerMile = load.postedRate; // postedRate is already rate-per-mile
  const rateScore = normalize(ratePerMile, 1.5, 3.5);
  const deadheadScore = Math.max(0, 10 - (deadheadMiles / 20));
  const marketRatio = load.postedRate / load.marketRateAvg;
  const marketScore = normalize(marketRatio, 0.8, 1.2);
  return (rateScore * 0.5) + (deadheadScore * 0.3) + (marketScore * 0.2);
}

/**
 * Calculate chain score for a load chain
 */
function calculateChainScore(chain: LoadChain): number {
  const revenuePerMile = chain.totalRevenue / chain.totalMiles;
  const avgMarketScore = chain.legs.reduce((sum, leg) => {
    const marketRatio = leg.load.postedRate / leg.load.marketRateAvg;
    return sum + normalize(marketRatio, 0.8, 1.2);
  }, 0) / chain.legs.length;
  const deadheadPenalty = chain.totalDeadhead / 10;
  const rawScore = (revenuePerMile * 0.6) + (avgMarketScore * 0.2) - (deadheadPenalty * 0.2);
  return normalize(rawScore, 1.5, 3.0);
}

/**
 * Check if a load destination is "toward" the final destination
 */
function isTowardDestination(
  loadOrigin: LocationBase,
  loadDest: LocationBase,
  finalDest: LocationBase
): boolean {
  const distFromLoadOriginToFinal = calculateDistance(
    loadOrigin.lat, loadOrigin.lng, finalDest.lat, finalDest.lng
  );
  const distFromLoadDestToFinal = calculateDistance(
    loadDest.lat, loadDest.lng, finalDest.lat, finalDest.lng
  );
  return distFromLoadDestToFinal < distFromLoadOriginToFinal * 0.8;
}

/**
 * Find all available loads from DynamoDB
 */
async function findAvailableLoads(
  equipment?: EquipmentType,
  minRate?: number,
  requestId?: string
): Promise<Load[]> {
  try {
    const command = new ScanCommand({
      TableName: LOADS_TABLE,
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'available' },
    });
    
    const response = await docClient.send(command);
    let loads = (response.Items || []) as Load[];
    
    if (equipment) {
      loads = loads.filter(load => load.equipment === equipment);
    }
    
    if (minRate !== undefined) {
      loads = loads.filter(load => load.postedRate >= minRate);
    }
    
    logInfo('Found available loads', {
      operation: 'findAvailableLoads',
      requestId: requestId || '',
      totalLoads: loads.length,
      equipment,
      minRate,
    });
    
    return loads;
  } catch (error: any) {
    logError(error, { operation: 'findAvailableLoads', requestId: requestId || '' });
    throw error;
  }
}

/**
 * Get driver information
 */
async function getDriver(driverId: string, requestId?: string): Promise<Driver | null> {
  try {
    const command = new GetCommand({
      TableName: DRIVERS_TABLE,
      Key: { driverId },
    });
    const response = await docClient.send(command);
    return response.Item as Driver || null;
  } catch (error: any) {
    logError(error, { operation: 'getDriver', requestId: requestId || '', driverId });
    return null;
  }
}

/**
 * Search for direct loads (one_way mode)
 */
async function searchDirectLoads(
  origin: LocationBase,
  destination: LocationBase,
  driverLocation: LocationBase,
  equipment?: EquipmentType,
  minRate?: number,
  requestId?: string
): Promise<LoadWithScore[]> {
  const allLoads = await findAvailableLoads(equipment, minRate, requestId);
  const directLoads: LoadWithScore[] = [];
  
  for (const load of allLoads) {
    const originDist = calculateDistance(
      origin.lat, origin.lng, load.origin.lat, load.origin.lng
    );
    const destDist = calculateDistance(
      destination.lat, destination.lng, load.destination.lat, load.destination.lng
    );
    
    if (originDist <= 75 && destDist <= 75) {
      const deadheadMiles = calculateDistance(
        driverLocation.lat, driverLocation.lng, load.origin.lat, load.origin.lng
      );
      const tripScore = calculateTripScore(load, deadheadMiles);
      const revenuePerMile = load.postedRate; // postedRate is already rate-per-mile
      
      let marketComparison: 'above' | 'at' | 'below' = 'at';
      if (load.postedRate > load.marketRateAvg * 1.05) marketComparison = 'above';
      else if (load.postedRate < load.marketRateAvg * 0.95) marketComparison = 'below';
      
      directLoads.push({ load, tripScore, deadheadMiles, revenuePerMile, marketComparison });
    }
  }
  
  directLoads.sort((a, b) => b.tripScore - a.tripScore);
  return directLoads;
}

/**
 * Search for load chains (corridor_chain mode)
 */
async function searchCorridorChains(
  origin: LocationBase,
  destination: LocationBase,
  driverLocation: LocationBase,
  equipment?: EquipmentType,
  minRate?: number,
  maxLegs: number = 3,
  requestId?: string
): Promise<LoadChain[]> {
  const allLoads = await findAvailableLoads(equipment, minRate, requestId);
  const firstLegLoads = allLoads.filter(load => {
    const distToPickup = calculateDistance(
      origin.lat, origin.lng, load.origin.lat, load.origin.lng
    );
    return distToPickup <= 75 && isTowardDestination(load.origin, load.destination, destination);
  });
  
  const chains: LoadChain[] = [];
  
  for (const firstLoad of firstLegLoads) {
    const deadheadToFirst = calculateDistance(
      driverLocation.lat, driverLocation.lng, firstLoad.origin.lat, firstLoad.origin.lng
    );
    
    const firstLegScore: LoadWithScore = {
      load: firstLoad,
      tripScore: calculateTripScore(firstLoad, deadheadToFirst),
      deadheadMiles: deadheadToFirst,
      revenuePerMile: firstLoad.postedRate, // postedRate is already rate-per-mile
      marketComparison: firstLoad.postedRate > firstLoad.marketRateAvg * 1.05 ? 'above' :
                        firstLoad.postedRate < firstLoad.marketRateAvg * 0.95 ? 'below' : 'at',
    };
    
    const distToFinalDest = calculateDistance(
      firstLoad.destination.lat, firstLoad.destination.lng, destination.lat, destination.lng
    );
    
    if (distToFinalDest <= 75) {
      const chain: LoadChain = {
        chainId: `CHAIN-${uuidv4().substring(0, 8)}`,
        legs: [firstLegScore],
        chainScore: 0,
        totalRevenue: firstLoad.postedRate * firstLoad.distanceMiles, // Calculate total pay
        totalMiles: firstLoad.distanceMiles + deadheadToFirst,
        totalDeadhead: deadheadToFirst,
        revenuePerMile: firstLoad.postedRate,
        summary: `${firstLoad.origin.city}, ${firstLoad.origin.state} → ${firstLoad.destination.city}, ${firstLoad.destination.state}`,
      };
      chain.chainScore = calculateChainScore(chain);
      chains.push(chain);
    } else if (maxLegs >= 2) {
      const secondLegLoads = allLoads.filter(load => {
        const distFromFirstDest = calculateDistance(
          firstLoad.destination.lat, firstLoad.destination.lng, load.origin.lat, load.origin.lng
        );
        const distToFinal = calculateDistance(
          load.destination.lat, load.destination.lng, destination.lat, destination.lng
        );
        return distFromFirstDest <= 75 && distToFinal <= 75 &&
               isTowardDestination(load.origin, load.destination, destination);
      });
      
      for (const secondLoad of secondLegLoads) {
        const deadheadToSecond = calculateDistance(
          firstLoad.destination.lat, firstLoad.destination.lng, secondLoad.origin.lat, secondLoad.origin.lng
        );
        
        const secondLegScore: LoadWithScore = {
          load: secondLoad,
          tripScore: calculateTripScore(secondLoad, deadheadToSecond),
          deadheadMiles: deadheadToSecond,
          revenuePerMile: secondLoad.postedRate, // postedRate is already rate-per-mile
          marketComparison: secondLoad.postedRate > secondLoad.marketRateAvg * 1.05 ? 'above' :
                            secondLoad.postedRate < secondLoad.marketRateAvg * 0.95 ? 'below' : 'at',
        };
        
        const chain: LoadChain = {
          chainId: `CHAIN-${uuidv4().substring(0, 8)}`,
          legs: [firstLegScore, secondLegScore],
          chainScore: 0,
          totalRevenue: (firstLoad.postedRate * firstLoad.distanceMiles) + (secondLoad.postedRate * secondLoad.distanceMiles), // Calculate total pay
          totalMiles: firstLoad.distanceMiles + secondLoad.distanceMiles + deadheadToFirst + deadheadToSecond,
          totalDeadhead: deadheadToFirst + deadheadToSecond,
          revenuePerMile: ((firstLoad.postedRate * firstLoad.distanceMiles) + (secondLoad.postedRate * secondLoad.distanceMiles)) / 
                          (firstLoad.distanceMiles + secondLoad.distanceMiles + deadheadToFirst + deadheadToSecond),
          summary: `${firstLoad.origin.city}, ${firstLoad.origin.state} → ${firstLoad.destination.city}, ${firstLoad.destination.state} → ${secondLoad.destination.city}, ${secondLoad.destination.state}`,
        };
        chain.chainScore = calculateChainScore(chain);
        chains.push(chain);
      }
    }
  }
  
  chains.sort((a, b) => b.chainScore - a.chainScore);
  return chains.slice(0, 10);
}

/**
 * Generate market insight and recommendation
 */
function generateMarketInsight(
  directLoads: LoadWithScore[],
  chains: LoadChain[]
): MarketInsight {
  const allLoads = [...directLoads.map(d => d.load), ...chains.flatMap(c => c.legs.map(l => l.load))];
  
  if (allLoads.length === 0) {
    return {
      avgMarketRate: 0,
      loadCount: 0,
      recommendation: 'No loads found matching your criteria.',
      bestOption: 'none',
    };
  }
  
  const avgMarketRate = allLoads.reduce((sum, load) => sum + load.marketRateAvg, 0) / allLoads.length;
  const loadCount = allLoads.length;
  const bestDirect = directLoads[0];
  const bestChain = chains[0];
  
  if (!bestDirect && !bestChain) {
    return {
      avgMarketRate,
      loadCount,
      recommendation: 'No suitable loads or chains found.',
      bestOption: 'none',
    };
  }
  
  if (!bestChain || !bestDirect) {
    if (bestDirect) {
      return {
        avgMarketRate,
        loadCount,
        recommendation: `Best direct load: ${bestDirect.load.origin.city} to ${bestDirect.load.destination.city} at $${bestDirect.revenuePerMile.toFixed(2)}/mile.`,
        bestOption: 'direct',
      };
    } else {
      return {
        avgMarketRate,
        loadCount,
        recommendation: `Best chain: ${bestChain.legs.length} legs earning $${bestChain.totalRevenue.toFixed(0)} total at $${bestChain.revenuePerMile.toFixed(2)}/mile.`,
        bestOption: 'chain',
      };
    }
  }
  
  const directRevenue = bestDirect.load.postedRate * bestDirect.load.distanceMiles; // Calculate total pay
  const chainRevenue = bestChain.totalRevenue;
  const savings = chainRevenue - directRevenue;
  
  if (savings > 50) {
    return {
      avgMarketRate,
      loadCount,
      recommendation: `Chain option pays $${savings.toFixed(0)} more than best direct load. Recommended.`,
      bestOption: 'chain',
      savingsVsDirect: savings,
    };
  } else if (savings < -50) {
    return {
      avgMarketRate,
      loadCount,
      recommendation: `Direct load is $${Math.abs(savings).toFixed(0)} better than chain. Take the direct load.`,
      bestOption: 'direct',
      savingsVsDirect: savings,
    };
  } else {
    return {
      avgMarketRate,
      loadCount,
      recommendation: `Direct and chain options are similar. Direct load is simpler with ${bestDirect.load.origin.city} to ${bestDirect.load.destination.city}.`,
      bestOption: 'direct',
      savingsVsDirect: savings,
    };
  }
}

/**
 * Main Lambda handler
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    if (!event.body) {
      return badRequestError('Request body is required', undefined, requestId);
    }
    
    const body: SmartSearchRequest = JSON.parse(event.body);
    
    if (!body.driverId) {
      return badRequestError('Field "driverId" is required', undefined, requestId);
    }
    
    const driver = await getDriver(body.driverId, requestId);
    if (!driver) {
      return badRequestError(`Driver ${body.driverId} not found`, undefined, requestId);
    }
    
    let origin: LocationBase;
    if (body.origin) {
      origin = body.origin;
    } else if (body.originCity && body.originState) {
      const originKey = `${body.originCity},${body.originState}`;
      const originCoords = CITY_COORDINATES[originKey];
      origin = {
        city: body.originCity,
        state: body.originState,
        lat: originCoords?.lat || driver.currentLocation.lat,
        lng: originCoords?.lng || driver.currentLocation.lng,
      };
    } else {
      return badRequestError('Origin location is required (originCity/originState or origin object)', undefined, requestId);
    }
    
    let destination: LocationBase | undefined;
    if (body.destination) {
      destination = body.destination;
    } else if (body.destCity && body.destState) {
      const destKey = `${body.destCity},${body.destState}`;
      const destCoords = CITY_COORDINATES[destKey];
      destination = {
        city: body.destCity,
        state: body.destState,
        lat: destCoords?.lat || 0,
        lng: destCoords?.lng || 0,
      };
    }
    
    const searchMode = body.searchMode || body.tripType || 'one_way';
    const equipment = body.equipment;
    const minRate = body.minRate;
    
    logInfo('Processing smart search request', {
      operation: 'smartSearch',
      requestId,
      driverId: body.driverId,
      searchMode,
      origin: `${origin.city}, ${origin.state}`,
      destination: destination ? `${destination.city}, ${destination.state}` : 'none',
      equipment,
      minRate,
    });
    
    let directLoads: LoadWithScore[] = [];
    let chains: LoadChain[] = [];
    
    if (searchMode === 'one_way' && destination) {
      directLoads = await searchDirectLoads(
        origin, destination, driver.currentLocation, equipment, minRate, requestId
      );
      
      if (directLoads.length === 0 || directLoads[0].tripScore < 7.0) {
        chains = await searchCorridorChains(
          origin, destination, driver.currentLocation, equipment, minRate, 3, requestId
        );
      }
    } else if (searchMode === 'corridor_chain' && destination) {
      chains = await searchCorridorChains(
        origin, destination, driver.currentLocation, equipment, minRate, 3, requestId
      );
    } else {
      return badRequestError('Unsupported search mode or missing destination', undefined, requestId);
    }
    
    const marketInsight = generateMarketInsight(directLoads, chains);
    const searchTime = Date.now() - startTime;
    
    logInfo('Smart search completed', {
      operation: 'smartSearch',
      requestId,
      searchTime,
      directLoadsFound: directLoads.length,
      chainsFound: chains.length,
    });
    
    return successResponse(
      {
        searchMode,
        directLoads: directLoads.slice(0, 10),
        chains,
        marketInsight,
        metadata: {
          searchTime,
          loadsScanned: directLoads.length + chains.flatMap(c => c.legs).length,
          chainsEvaluated: chains.length,
          driverLocation: driver.currentLocation,
        },
      },
      200,
      requestId
    );
  } catch (error: any) {
    logError(error, { operation: 'smartSearch', requestId });
    return internalServerError('An unexpected error occurred', requestId);
  }
};
