// Driver Dashboard Lambda - GET /driver/{driverId}/dashboard
// Retrieves dashboard metrics for a driver

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    Booking,
    DriverDashboardResponse,
    generateRequestId,
    getBookingsTableName,
    getItem,
    getLoadsTableName,
    internalServerError,
    Load,
    logError,
    logInfo,
    scanTable,
    successResponse,
} from './shared';

/**
 * Lambda handler for driver dashboard
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  try {
    // Extract driverId from path parameters
    const driverId = event.pathParameters?.driverId;

    if (!driverId) {
      return badRequestError('Missing driverId parameter', undefined, requestId);
    }

    logInfo('Processing driver dashboard request', {
      operation: 'driverDashboard',
      requestId,
      driverId,
    });

    // Query Bookings table for all driver's bookings
    const { items: allBookings } = await scanTable<Booking>(
      getBookingsTableName(),
      '#driverId = :driverId',
      { '#driverId': 'driverId' },
      { ':driverId': driverId }
    );

    // Filter bookings with status "delivered"
    const deliveredBookings = allBookings.filter(
      (booking) => booking.status === 'delivered'
    );

    // Calculate metrics
    let totalEarnings = 0;
    let totalMiles = 0;
    const loadsCompleted = deliveredBookings.length;

    // For each delivered booking, fetch the load to get distanceMiles
    for (const booking of deliveredBookings) {
      try {
        const load = await getItem<Load>(getLoadsTableName(), { loadId: booking.loadId });
        
        if (load) {
          const earnings = booking.finalRate * load.distanceMiles;
          totalEarnings += earnings;
          totalMiles += load.distanceMiles;
        }
      } catch (error) {
        // Log error but continue processing other bookings
        logError(error, {
          operation: 'driverDashboard',
          requestId,
          bookingId: booking.bookingId,
          loadId: booking.loadId,
        });
      }
    }

    // Calculate average rate per mile
    const avgRate = totalMiles > 0 ? totalEarnings / totalMiles : 0;

    // Build response
    const response: DriverDashboardResponse = {
      driverId,
      totalEarnings,
      loadsCompleted,
      avgRate,
    };

    logInfo('Driver dashboard retrieved successfully', {
      operation: 'driverDashboard',
      requestId,
      driverId,
      loadsCompleted,
      totalEarnings,
      avgRate,
    });

    return successResponse(response, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'driverDashboard',
      requestId,
      driverId: event.pathParameters?.driverId,
    });
    return internalServerError('Failed to retrieve driver dashboard', requestId);
  }
}
