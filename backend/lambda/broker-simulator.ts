// Broker Simulator Lambda - Simulates realistic broker negotiation responses
// POST /simulate-broker-response

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    generateRequestId,
    internalServerError,
    logError,
    logInfo,
    successResponse,
} from './shared/response';

interface BrokerSimulationRequest {
  negotiationId: string;
  driverOffer: number;
  postedRate: number;
  marketRateAvg: number;
  round: number;
  maxRounds?: number;
}

interface BrokerSimulationResponse {
  action: 'accept' | 'counter' | 'reject';
  brokerOffer?: number;
  message: string;
  delaySeconds: number;
}

/**
 * Generate random delay in seconds
 */
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate broker message based on action
 */
function generateBrokerMessage(
  action: 'accept' | 'counter' | 'reject',
  driverOffer: number,
  brokerOffer?: number
): string {
  const messages = {
    accept: [
      `We can work with $${driverOffer.toFixed(2)}/mile. Let's get this load moving!`,
      `Agreed at $${driverOffer.toFixed(2)}/mile. I'll send the rate confirmation right away.`,
      `That works for us. $${driverOffer.toFixed(2)}/mile is fair for this lane.`,
      `You've got a deal at $${driverOffer.toFixed(2)}/mile. Sending paperwork now.`,
    ],
    counter: [
      `I can do $${brokerOffer?.toFixed(2)}/mile on this lane. That's our best offer for this timeframe.`,
      `How about we meet at $${brokerOffer?.toFixed(2)}/mile? That's the highest I can go.`,
      `I'm authorized to offer $${brokerOffer?.toFixed(2)}/mile. Can you work with that?`,
      `Best I can do is $${brokerOffer?.toFixed(2)}/mile. This is a hot load and we need it covered.`,
    ],
    reject: [
      `Unfortunately, $${driverOffer.toFixed(2)}/mile is outside our budget for this lane.`,
      `I appreciate the offer, but we can't go that high on this load.`,
      `That rate doesn't work for us. Thanks for your time.`,
      `We'll have to pass at $${driverOffer.toFixed(2)}/mile. Good luck out there!`,
    ],
  };
  
  const options = messages[action];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Simulate broker response logic
 * NOTE: Driver offers ABOVE posted rate (driver wants more money)
 */
function simulateBrokerResponse(
  driverOffer: number,
  postedRate: number,
  marketRateAvg: number,
  round: number,
  maxRounds: number
): BrokerSimulationResponse {
  // Calculate how much driver is asking above posted rate
  const offerRatio = driverOffer / postedRate;
  const marketRatio = driverOffer / marketRateAvg;
  
  // Final round - broker gives in
  if (round >= maxRounds) {
    return {
      action: 'accept',
      message: generateBrokerMessage('accept', driverOffer),
      delaySeconds: randomDelay(5, 30),
    };
  }
  
  // Driver offer is at or below posted rate - instant accept
  if (offerRatio <= 1.0) {
    return {
      action: 'accept',
      message: generateBrokerMessage('accept', driverOffer),
      delaySeconds: randomDelay(5, 15),
    };
  }
  
  // Driver offer is within 5% above market rate - likely accept
  if (marketRatio <= 1.05) {
    // 80% chance to accept, 20% chance to counter (decreases with rounds)
    const acceptProbability = 0.8 - (round - 1) * 0.1;
    
    if (Math.random() < acceptProbability) {
      return {
        action: 'accept',
        message: generateBrokerMessage('accept', driverOffer),
        delaySeconds: randomDelay(10, 45),
      };
    } else {
      // Counter at 95% of posted rate
      const brokerOffer = postedRate * 0.95;
      return {
        action: 'counter',
        brokerOffer,
        message: generateBrokerMessage('counter', driverOffer, brokerOffer),
        delaySeconds: randomDelay(30, 90),
      };
    }
  }
  
  // Driver offer is 5-15% above posted rate - counter halfway
  if (offerRatio <= 1.15) {
    const brokerOffer = (driverOffer + postedRate) / 2;
    return {
      action: 'counter',
      brokerOffer,
      message: generateBrokerMessage('counter', driverOffer, brokerOffer),
      delaySeconds: randomDelay(30, 120),
    };
  }
  
  // Driver offer is >15% above market rate - reject
  return {
    action: 'reject',
    message: generateBrokerMessage('reject', driverOffer),
    delaySeconds: randomDelay(10, 60),
  };
}

/**
 * Main Lambda handler
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = generateRequestId();
  
  try {
    // Parse request body
    if (!event.body) {
      return badRequestError('Request body is required', undefined, requestId);
    }
    
    const body: BrokerSimulationRequest = JSON.parse(event.body);
    
    // Validate required fields
    if (!body.negotiationId) {
      return badRequestError('Field "negotiationId" is required', undefined, requestId);
    }
    
    if (typeof body.driverOffer !== 'number' || body.driverOffer <= 0) {
      return badRequestError('Field "driverOffer" must be a positive number', undefined, requestId);
    }
    
    if (typeof body.postedRate !== 'number' || body.postedRate <= 0) {
      return badRequestError('Field "postedRate" must be a positive number', undefined, requestId);
    }
    
    if (typeof body.marketRateAvg !== 'number' || body.marketRateAvg <= 0) {
      return badRequestError('Field "marketRateAvg" must be a positive number', undefined, requestId);
    }
    
    if (typeof body.round !== 'number' || body.round < 1) {
      return badRequestError('Field "round" must be a positive integer', undefined, requestId);
    }
    
    const maxRounds = body.maxRounds || 4;
    
    logInfo('Simulating broker response', {
      operation: 'brokerSimulator',
      requestId,
      negotiationId: body.negotiationId,
      driverOffer: body.driverOffer,
      postedRate: body.postedRate,
      marketRateAvg: body.marketRateAvg,
      round: body.round,
      maxRounds,
    });
    
    // Simulate broker response
    const response = simulateBrokerResponse(
      body.driverOffer,
      body.postedRate,
      body.marketRateAvg,
      body.round,
      maxRounds
    );
    
    logInfo('Broker simulation completed', {
      operation: 'brokerSimulator',
      requestId,
      action: response.action,
      brokerOffer: response.brokerOffer,
    });
    
    return successResponse(
      {
        negotiationId: body.negotiationId,
        ...response,
      },
      200,
      requestId
    );
  } catch (error: any) {
    logError(error, {
      operation: 'brokerSimulator',
      requestId,
    });
    return internalServerError('An unexpected error occurred', requestId);
  }
};
