// Broker Response Lambda - POST /negotiations/{negotiationId}/broker-response
// Handles broker responses in autonomous negotiation

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { marshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    Booking,
    BrokerResponseRequest,
    BrokerResponseResponse,
    Document,
    Driver,
    generateId,
    generateRequestId,
    getBookingsTableName,
    getCurrentTimestamp,
    getDocumentsBucketName,
    getDocumentsTableName,
    getDriversTableName,
    getItem,
    getLoadsTableName,
    getNegotiationsTableName,
    internalServerError,
    Load,
    logError,
    logInfo,
    Negotiation,
    notFoundError,
    Offer,
    parseBody,
    serviceUnavailableError,
    successResponse,
    transactWrite,
    updateItem,
    uploadToS3
} from './shared';

// Initialize Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Parse broker's counter-offer from email body
 * Looks for dollar amounts or rate per mile mentions
 */
function parseCounterOffer(emailBody: string, counterOffer?: number): number | null {
  // If counter-offer is explicitly provided, use it
  if (counterOffer !== undefined && counterOffer !== null) {
    return counterOffer;
  }

  // Try to extract rate from email body
  // Look for patterns like "$2.50/mile", "$2.50 per mile", "2.50/mi"
  const ratePatterns = [
    /\$(\d+\.?\d*)\s*\/\s*mi(?:le)?/i,
    /\$(\d+\.?\d*)\s+per\s+mi(?:le)?/i,
    /(\d+\.?\d*)\s*\/\s*mi(?:le)?/i,
  ];

  for (const pattern of ratePatterns) {
    const match = emailBody.match(pattern);
    if (match && match[1]) {
      const rate = parseFloat(match[1]);
      if (!isNaN(rate) && rate > 0) {
        return rate;
      }
    }
  }

  return null;
}

/**
 * Build Bedrock prompt for counter-offer generation
 */
function buildCounterOfferPrompt(
  load: Load,
  driver: Driver,
  negotiation: Negotiation,
  brokerOffer: number
): string {
  const strategyInstructions = {
    aggressive: 'Be firm and assertive. Counter with a rate closer to your minimum but show you\'re willing to walk away if needed.',
    moderate: 'Be professional and balanced. Make a reasonable counter-offer that moves toward middle ground.',
    conservative: 'Be polite and accommodating. Show flexibility and willingness to find common ground.',
  };

  const previousOffers = negotiation.offers
    .map((offer) => `Round ${offer.round}: ${offer.sender} offered $${offer.amount.toFixed(2)}/mile`)
    .join('\n');

  return `You are an AI negotiation assistant for a truck driver. The broker has responded with a counter-offer. Your task is to write a professional counter-offer email.

LOAD DETAILS:
- Load ID: ${load.loadId}
- Origin: ${load.origin.city}, ${load.origin.state}
- Destination: ${load.destination.city}, ${load.destination.state}
- Distance: ${load.distanceMiles} miles
- Equipment: ${load.equipment}

RATE INFORMATION:
- Posted Rate: ${load.postedRate.toFixed(2)}/mile
- Market Average: ${load.marketRateAvg.toFixed(2)}/mile
- Market High: ${load.marketRateHigh.toFixed(2)}/mile
- Driver's Minimum Rate: ${driver.minRate.toFixed(2)}/mile
- Broker's Current Offer: ${brokerOffer.toFixed(2)}/mile

NEGOTIATION HISTORY:
${previousOffers}

CURRENT ROUND: ${negotiation.currentRound + 1} of ${negotiation.maxRounds}

NEGOTIATION STRATEGY: ${negotiation.strategy}
${strategyInstructions[negotiation.strategy]}

The broker's offer of $${brokerOffer.toFixed(2)}/mile is below your minimum rate of $${driver.minRate.toFixed(2)}/mile.

Write a professional counter-offer email that:
1. Acknowledges the broker's offer
2. Explains why you need a higher rate (reference market data)
3. Makes a clear counter-offer at or above $${driver.minRate.toFixed(2)}/mile
4. Emphasizes value and reliability
5. Is concise (under 200 words)
6. Matches the ${negotiation.strategy} strategy tone

Return ONLY the email body text, no subject line or signatures.`;
}

/**
 * Call Amazon Bedrock to generate counter-offer email
 */
async function generateCounterOfferEmail(
  load: Load,
  driver: Driver,
  negotiation: Negotiation,
  brokerOffer: number
): Promise<string> {
  try {
    const prompt = buildCounterOfferPrompt(load, driver, negotiation, brokerOffer);

    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command);

    if (!response.body) {
      throw new Error('Empty response from Bedrock');
    }

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Extract text from Claude's response
    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      return responseBody.content[0].text.trim();
    }

    throw new Error('Invalid response format from Bedrock');
  } catch (error) {
    const err = error as any;
    console.error('Bedrock API error:', {
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
      modelId: process.env.BEDROCK_MODEL_ID,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`Bedrock API failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'generateCounterOfferEmail';
    (enhancedError as any).service = 'bedrock';
    throw enhancedError;
  }
}

/**
 * Send email to n8n webhook
 */
async function sendToN8nWebhook(
  webhookUrl: string,
  payload: {
    to: string;
    subject: string;
    body: string;
    loadId: string;
    negotiationId: string;
  }
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`n8n webhook returned status ${response.status}`);
    }

    logInfo('Email sent to n8n webhook', {
      operation: 'sendToN8nWebhook',
      requestId: 'webhook',
      webhookUrl,
      loadId: payload.loadId,
      negotiationId: payload.negotiationId,
    });
  } catch (error) {
    const err = error as any;
    console.error('n8n webhook error:', {
      errorName: err.name,
      errorMessage: err.message,
      webhookUrl,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`Webhook service failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'sendToN8nWebhook';
    (enhancedError as any).service = 'n8n';
    throw enhancedError;
  }
}

/**
 * Generate rate confirmation document content
 */
function generateRateConfirmation(load: Load, booking: Booking): string {
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return `
RATE CONFIRMATION

Confirmation Number: ${booking.bookingId}
Date: ${timestamp}

LOAD DETAILS
Load ID: ${load.loadId}
Equipment: ${load.equipment}
Weight: ${load.weightLbs} lbs
Distance: ${load.distanceMiles} miles

ORIGIN
${load.origin.address}
${load.origin.city}, ${load.origin.state}

DESTINATION
${load.destination.address}
${load.destination.city}, ${load.destination.state}

PICKUP WINDOW
${load.pickupWindow}

DELIVERY DEADLINE
${load.deliveryDeadline}

RATE INFORMATION
Rate per Mile: ${booking.finalRate.toFixed(2)}
Total Amount: ${(booking.finalRate * load.distanceMiles).toFixed(2)}

BROKER INFORMATION
Company: ${load.broker.name}
Contact: ${load.broker.contact}
Email: ${load.broker.email}
Phone: ${load.broker.phone}
Payment Terms: ${load.broker.paymentTerms}

DRIVER INFORMATION
Driver ID: ${booking.driverId}

This rate confirmation serves as a binding agreement between the carrier and broker
for the transportation services described above.

Generated by Feightly.ai - Negotiated Rate
`.trim();
}

/**
 * Create booking from accepted negotiation
 */
async function createBookingFromNegotiation(
  load: Load,
  negotiation: Negotiation,
  finalRate: number
): Promise<string> {
  const bookingId = generateId('booking');
  const docId = generateId('doc');
  const timestamp = getCurrentTimestamp();

  // Create booking record
  const booking: Booking = {
    bookingId,
    loadId: negotiation.loadId,
    driverId: negotiation.driverId,
    finalRate,
    status: 'confirmed',
    bookedAt: timestamp,
    rateConDocId: docId,
  };

  // Generate rate confirmation document
  const rateConfirmation = generateRateConfirmation(load, booking);
  const s3Key = `rate-confirmations/${bookingId}.txt`;

  // Upload document to S3
  await uploadToS3(
    getDocumentsBucketName(),
    s3Key,
    rateConfirmation,
    'text/plain'
  );

  // Create document record
  const document: Document = {
    docId,
    loadId: negotiation.loadId,
    driverId: negotiation.driverId,
    docType: 'rate_confirmation',
    s3Key,
    createdAt: timestamp,
  };

  // Execute DynamoDB transaction
  await transactWrite([
    // Update load status to "booked"
    {
      Update: {
        TableName: getLoadsTableName(),
        Key: marshall({ loadId: negotiation.loadId }),
        UpdateExpression: 'SET #status = :booked',
        ConditionExpression: '#status = :available OR #status = :negotiation',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':available': 'available',
          ':negotiation': 'in_negotiation',
          ':booked': 'booked',
        }),
      },
    },
    // Create booking record
    {
      Put: {
        TableName: getBookingsTableName(),
        Item: marshall(booking, { removeUndefinedValues: true }),
      },
    },
    // Create document record
    {
      Put: {
        TableName: getDocumentsTableName(),
        Item: marshall(document, { removeUndefinedValues: true }),
      },
    },
  ]);

  return bookingId;
}

/**
 * Lambda handler for broker response
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

    // Parse request body
    const body = parseBody<BrokerResponseRequest>(event.body);

    if (!body) {
      return badRequestError('Missing request body', undefined, requestId);
    }

    // Validate required fields
    const requiredFields = ['brokerEmail', 'emailBody'];
    const missingFields = requiredFields.filter(
      (field) => !body[field as keyof BrokerResponseRequest]
    );

    if (missingFields.length > 0) {
      return badRequestError(
        `Missing required fields: ${missingFields.join(', ')}`,
        { missingFields },
        requestId
      );
    }

    logInfo('Processing broker response', {
      operation: 'brokerResponse',
      requestId,
      negotiationId,
    });

    // Retrieve negotiation record
    const negotiation = await getItem<Negotiation>(
      getNegotiationsTableName(),
      { negotiationId }
    );

    if (!negotiation) {
      return notFoundError('Negotiation', negotiationId, requestId);
    }

    // Check if negotiation is still in progress
    if (negotiation.status !== 'in_progress') {
      return badRequestError(
        `Negotiation is not in progress (current status: ${negotiation.status})`,
        undefined,
        requestId
      );
    }

    // Parse broker's counter-offer
    const brokerCounterOffer = parseCounterOffer(body.emailBody, body.counterOffer);

    if (brokerCounterOffer === null) {
      return badRequestError(
        'Could not parse counter-offer from broker response. Please provide counterOffer field.',
        undefined,
        requestId
      );
    }

    logInfo('Parsed broker counter-offer', {
      operation: 'brokerResponse',
      requestId,
      negotiationId,
      counterOffer: brokerCounterOffer,
    });

    // Increment current round
    const newRound = negotiation.currentRound + 1;
    const timestamp = getCurrentTimestamp();

    // Add broker's offer to offers list
    const brokerOffer: Offer = {
      round: newRound,
      amount: brokerCounterOffer,
      sender: 'broker',
      timestamp,
      emailBody: body.emailBody,
    };

    const updatedOffers = [...negotiation.offers, brokerOffer];

    // Decision logic
    let newStatus: 'in_progress' | 'accepted' | 'walked_away' = negotiation.status;
    let bookingId: string | undefined;
    let driverCounterOffer: Offer | undefined;

    // Check if broker accepts or meets driver's minimum rate
    if (brokerCounterOffer >= negotiation.driverMinRate) {
      // Accept the negotiation and create booking
      newStatus = 'accepted';

      logInfo('Broker offer meets minimum rate, accepting negotiation', {
        operation: 'brokerResponse',
        requestId,
        negotiationId,
        brokerOffer: brokerCounterOffer,
        driverMinRate: negotiation.driverMinRate,
      });

      // Retrieve load for booking
      const load = await getItem<Load>(getLoadsTableName(), { loadId: negotiation.loadId });

      if (!load) {
        return badRequestError(
          `Load with ID ${negotiation.loadId} not found`,
          undefined,
          requestId
        );
      }

      // Create booking
      try {
        bookingId = await createBookingFromNegotiation(load, negotiation, brokerCounterOffer);
      } catch (error) {
        logError(error, {
          operation: 'brokerResponse',
          requestId,
          step: 'createBooking',
        });
        return internalServerError('Failed to create booking', requestId);
      }
    } else if (newRound < negotiation.maxRounds) {
      // Continue negotiation with counter-offer
      logInfo('Continuing negotiation with counter-offer', {
        operation: 'brokerResponse',
        requestId,
        negotiationId,
        currentRound: newRound,
        maxRounds: negotiation.maxRounds,
      });

      // Retrieve load and driver for counter-offer generation
      const [load, driver] = await Promise.all([
        getItem<Load>(getLoadsTableName(), { loadId: negotiation.loadId }),
        getItem<Driver>(getDriversTableName(), { driverId: negotiation.driverId }),
      ]);

      if (!load) {
        return badRequestError(
          `Load with ID ${negotiation.loadId} not found`,
          undefined,
          requestId
        );
      }

      if (!driver) {
        return badRequestError(
          `Driver with ID ${negotiation.driverId} not found`,
          undefined,
          requestId
        );
      }

      // Generate counter-offer email using Bedrock
      let counterOfferEmail: string;
      try {
        counterOfferEmail = await generateCounterOfferEmail(
          load,
          driver,
          negotiation,
          brokerCounterOffer
        );
      } catch (error) {
        logError(error, {
          operation: 'brokerResponse',
          requestId,
          step: 'bedrockCall',
        });
        return serviceUnavailableError('AI service', requestId);
      }

      // Create driver's counter-offer
      driverCounterOffer = {
        round: newRound + 1,
        amount: driver.minRate,
        sender: 'driver',
        timestamp: getCurrentTimestamp(),
        emailBody: counterOfferEmail,
      };

      updatedOffers.push(driverCounterOffer);

      // Send counter-offer to n8n webhook
      try {
        await sendToN8nWebhook(negotiation.n8nWebhookUrl, {
          to: negotiation.brokerEmail,
          subject: `Re: Rate Negotiation for Load ${load.loadId} - Round ${newRound + 1}`,
          body: counterOfferEmail,
          loadId: load.loadId,
          negotiationId,
        });
      } catch (error) {
        logError(error, {
          operation: 'brokerResponse',
          requestId,
          step: 'webhookSend',
        });
        return serviceUnavailableError('Email service', requestId);
      }
    } else {
      // Max rounds reached, walk away
      newStatus = 'walked_away';

      logInfo('Max rounds reached, walking away from negotiation', {
        operation: 'brokerResponse',
        requestId,
        negotiationId,
        currentRound: newRound,
        maxRounds: negotiation.maxRounds,
      });
    }

    // Update negotiation record in DynamoDB
    try {
      await updateItem(
        getNegotiationsTableName(),
        { negotiationId },
        'SET #status = :status, #currentRound = :currentRound, #offers = :offers',
        {
          '#status': 'status',
          '#currentRound': 'currentRound',
          '#offers': 'offers',
        },
        {
          ':status': newStatus,
          ':currentRound': newRound,
          ':offers': updatedOffers,
        }
      );
    } catch (error) {
      logError(error, {
        operation: 'brokerResponse',
        requestId,
        step: 'dynamodbUpdate',
      });
      return internalServerError('Failed to update negotiation', requestId);
    }

    // Build response
    const response: BrokerResponseResponse = {
      negotiationId,
      status: newStatus,
      currentRound: newRound,
      ...(driverCounterOffer && {
        latestOffer: {
          round: driverCounterOffer.round,
          amount: driverCounterOffer.amount,
          sender: driverCounterOffer.sender,
        },
      }),
      ...(bookingId && { bookingId }),
    };

    logInfo('Broker response processed successfully', {
      operation: 'brokerResponse',
      requestId,
      negotiationId,
      newStatus,
      bookingId,
    });

    return successResponse(response, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'brokerResponse',
      requestId,
      negotiationId: event.pathParameters?.negotiationId,
    });
    return internalServerError('Failed to process broker response', requestId);
  }
}
