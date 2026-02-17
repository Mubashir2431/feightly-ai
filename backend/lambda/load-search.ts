// Load Search Lambda - GET /loads
// Searches for available loads with optional filters

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    calculateDistance,
    Driver,
    generateRequestId,
    getDriversTableName,
    getItem,
    getLoadsTableName,
    internalServerError,
    Load,
    LoadSearchParams,
    LoadSearchResponse,
    logError,
    logInfo,
    parseQueryParams,
    scanTable,
    successResponse,
    validateBookingType,
    validateEquipment
} from './shared';

/**
 * Lambda handler for load search
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  try {
    logInfo('Processing load search request', {
      operation: 'loadSearch',
      requestId,
      queryParams: event.queryStringParameters,
    });

    // Parse query parameters
    const params = parseQueryParams(event.queryStringParameters);
    const searchParams: LoadSearchParams = {
      originCity: params.originCity,
      destCity: params.destCity,
      equipment: params.equipment,
      minRate: params.minRate,
      maxDeadhead: params.maxDeadhead,
      bookingType: params.bookingType,
      driverId: params.driverId,
    };

    // Validate equipment if provided
    if (searchParams.equipment) {
      const validation = validateEquipment(searchParams.equipment);
      if (!validation.valid) {
        return badRequestError(validation.error!, undefined, requestId);
      }
    }

    // Validate booking type if provided
    if (searchParams.bookingType) {
      const validation = validateBookingType(searchParams.bookingType);
      if (!validation.valid) {
        return badRequestError(validation.error!, undefined, requestId);
      }
    }

    // Validate minRate if provided
    if (searchParams.minRate !== undefined) {
      if (typeof searchParams.minRate !== 'number' || searchParams.minRate <= 0) {
        return badRequestError('minRate must be a positive number', undefined, requestId);
      }
    }

    // Validate maxDeadhead if provided
    if (searchParams.maxDeadhead !== undefined) {
      if (typeof searchParams.maxDeadhead !== 'number' || searchParams.maxDeadhead <= 0) {
        return badRequestError('maxDeadhead must be a positive number', undefined, requestId);
      }

      // maxDeadhead requires driverId
      if (!searchParams.driverId) {
        return badRequestError(
          'driverId is required when using maxDeadhead filter',
          undefined,
          requestId
        );
      }
    }

    // Get driver location if maxDeadhead is specified
    let driverLocation: { lat: number; lng: number } | undefined;
    if (searchParams.maxDeadhead && searchParams.driverId) {
      const driver = await getItem<Driver>(
        getDriversTableName(),
        { driverId: searchParams.driverId }
      );

      if (!driver) {
        return badRequestError(
          `Driver with ID ${searchParams.driverId} not found`,
          undefined,
          requestId
        );
      }

      driverLocation = {
        lat: driver.currentLocation.lat,
        lng: driver.currentLocation.lng,
      };
    }

    // Build filter expression for DynamoDB scan
    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always filter by status = "available"
    filterExpressions.push('#status = :available');
    expressionAttributeNames['#status'] = 'status';
    expressionAttributeValues[':available'] = 'available';

    // Filter by origin city
    if (searchParams.originCity) {
      filterExpressions.push('contains(#origin.#city, :originCity)');
      expressionAttributeNames['#origin'] = 'origin';
      expressionAttributeNames['#city'] = 'city';
      expressionAttributeValues[':originCity'] = searchParams.originCity;
    }

    // Filter by destination city
    if (searchParams.destCity) {
      filterExpressions.push('contains(#destination.#destCity, :destCity)');
      expressionAttributeNames['#destination'] = 'destination';
      expressionAttributeNames['#destCity'] = 'city';
      expressionAttributeValues[':destCity'] = searchParams.destCity;
    }

    // Filter by equipment
    if (searchParams.equipment) {
      filterExpressions.push('#equipment = :equipment');
      expressionAttributeNames['#equipment'] = 'equipment';
      expressionAttributeValues[':equipment'] = searchParams.equipment;
    }

    // Filter by minimum rate
    if (searchParams.minRate !== undefined) {
      filterExpressions.push('#postedRate >= :minRate');
      expressionAttributeNames['#postedRate'] = 'postedRate';
      expressionAttributeValues[':minRate'] = searchParams.minRate;
    }

    // Filter by booking type
    if (searchParams.bookingType) {
      filterExpressions.push('#bookingType = :bookingType');
      expressionAttributeNames['#bookingType'] = 'bookingType';
      expressionAttributeValues[':bookingType'] = searchParams.bookingType;
    }

    // Scan DynamoDB table with filters
    const filterExpression = filterExpressions.join(' AND ');
    const { items: loads } = await scanTable<Load>(
      getLoadsTableName(),
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues
    );

    // Apply maxDeadhead filter (post-scan, as it requires distance calculation)
    let filteredLoads = loads;
    if (searchParams.maxDeadhead && driverLocation) {
      filteredLoads = loads.filter((load) => {
        const distance = calculateDistance(
          driverLocation!.lat,
          driverLocation!.lng,
          load.origin.lat,
          load.origin.lng
        );
        return distance <= searchParams.maxDeadhead!;
      });
    }

    // Build response
    const response: LoadSearchResponse = {
      loads: filteredLoads,
      hasMore: false, // Pagination not yet implemented - all results returned
    };

    logInfo('Load search completed', {
      operation: 'loadSearch',
      requestId,
      resultCount: filteredLoads.length,
      filters: searchParams,
    });

    return successResponse(response, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'loadSearch',
      requestId,
    });
    return internalServerError('Failed to search loads', requestId);
  }
}
