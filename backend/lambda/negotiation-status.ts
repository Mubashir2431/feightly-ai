// Negotiation Status Lambda - GET /negotiations/{negotiationId}
// Retrieves a negotiation record with all offers and current status

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    generateRequestId,
    getItem,
    getNegotiationsTableName,
    internalServerError,
    logError,
    logInfo,
    Negotiation,
    notFoundError,
    successResponse,
} from './shared';

/**
 * Lambda handler for negotiation status retrieval
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  try {
    // Extract negotiationId from path parameters
    const negotiationId = event.pathParameters?.negotiationId;

    if (!negotiationId) {
      return badRequestError('Missing negotiationId parameter', undefined, requestId);
    }

    logInfo('Processing negotiation status request', {
      operation: 'negotiationStatus',
      requestId,
      negotiationId,
    });

    // Query DynamoDB for the negotiation
    const negotiation = await getItem<Negotiation>(
      getNegotiationsTableName(),
      { negotiationId }
    );

    if (!negotiation) {
      logInfo('Negotiation not found', {
        operation: 'negotiationStatus',
        requestId,
        negotiationId,
      });
      return notFoundError('Negotiation', negotiationId, requestId);
    }

    logInfo('Negotiation status retrieved successfully', {
      operation: 'negotiationStatus',
      requestId,
      negotiationId,
      status: negotiation.status,
      currentRound: negotiation.currentRound,
      offersCount: negotiation.offers.length,
    });

    return successResponse(negotiation, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'negotiationStatus',
      requestId,
      negotiationId: event.pathParameters?.negotiationId,
    });
    return internalServerError('Failed to retrieve negotiation', requestId);
  }
}
