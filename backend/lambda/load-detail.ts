// Load Detail Lambda - GET /loads/{loadId}
// Retrieves a single load by ID

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    generateRequestId,
    getItem,
    getLoadsTableName,
    internalServerError,
    Load,
    logError,
    logInfo,
    notFoundError,
    successResponse,
} from './shared';

/**
 * Lambda handler for load detail retrieval
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  try {
    // Extract loadId from path parameters
    const loadId = event.pathParameters?.loadId;

    if (!loadId) {
      return badRequestError('Missing loadId parameter', undefined, requestId);
    }

    logInfo('Processing load detail request', {
      operation: 'loadDetail',
      requestId,
      loadId,
    });

    // Query DynamoDB for the load
    const load = await getItem<Load>(getLoadsTableName(), { loadId });

    if (!load) {
      logInfo('Load not found', {
        operation: 'loadDetail',
        requestId,
        loadId,
      });
      return notFoundError('Load', loadId, requestId);
    }

    logInfo('Load detail retrieved successfully', {
      operation: 'loadDetail',
      requestId,
      loadId,
      status: load.status,
    });

    return successResponse(load, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'loadDetail',
      requestId,
      loadId: event.pathParameters?.loadId,
    });
    return internalServerError('Failed to retrieve load', requestId);
  }
}
