// Negotiate Lambda - POST /negotiate
// Starts autonomous negotiation with broker using AI

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    Driver,
    generateId,
    generateRequestId,
    getCurrentTimestamp,
    getDriversTableName,
    getItem,
    getLoadsTableName,
    getNegotiationsTableName,
    internalServerError,
    Load,
    logError,
    logInfo,
    Negotiation,
    NegotiationStrategy,
    Offer,
    parseBody,
    putItem,
    serviceUnavailableError,
    StartNegotiationRequest,
    StartNegotiationResponse,
    successResponse,
    validateNegotiationStrategy,
} from './shared';

// Initialize Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Build Bedrock prompt for negotiation email generation
 */
function buildNegotiationPrompt(
  load: Load,
  driver: Driver,
  strategy: NegotiationStrategy
): string {
  const strategyInstructions = {
    aggressive: 'Be assertive and aim for rates at or above market high. Start with a strong opening offer and be willing to walk away if the broker doesn\'t meet your minimum rate.',
    moderate: 'Be professional and balanced. Aim for rates between market average and market high. Show flexibility but maintain your minimum rate.',
    conservative: 'Be polite and accommodating. Aim for rates at or slightly above market average. Show willingness to negotiate and build long-term relationships.',
  };

  return `You are an AI negotiation assistant for a truck driver. Your task is to write a professional email to a freight broker to negotiate a better rate for a load.

LOAD DETAILS:
- Load ID: ${load.loadId}
- Origin: ${load.origin.city}, ${load.origin.state}
- Destination: ${load.destination.city}, ${load.destination.state}
- Distance: ${load.distanceMiles} miles
- Equipment: ${load.equipment}
- Weight: ${load.weightLbs} lbs
- Pickup Window: ${load.pickupWindow}
- Delivery Deadline: ${load.deliveryDeadline}

RATE INFORMATION:
- Posted Rate: $${load.postedRate.toFixed(2)}/mile
- Market Average: $${load.marketRateAvg.toFixed(2)}/mile
- Market High: $${load.marketRateHigh.toFixed(2)}/mile
- Market Low: $${load.marketRateLow.toFixed(2)}/mile
- Rate Trend: ${load.rateTrend}
- Driver's Minimum Rate: $${driver.minRate.toFixed(2)}/mile

BROKER INFORMATION:
- Company: ${load.broker.name}
- Contact: ${load.broker.contact}
- Email: ${load.broker.email}
- Rating: ${load.broker.rating}/5
- Payment Terms: ${load.broker.paymentTerms}
- On-Time Payment: ${load.broker.onTimePayment}%

DRIVER INFORMATION:
- Driver ID: ${driver.driverId}
- Equipment: ${driver.equipment}
- Home Base: ${driver.homeBase.city}, ${driver.homeBase.state}

NEGOTIATION STRATEGY: ${strategy}
${strategyInstructions[strategy]}

Write a professional email to the broker requesting a rate of $${driver.minRate.toFixed(2)}/mile or higher. The email should:
1. Reference the load ID and route
2. Highlight relevant market data and rate trends
3. Emphasize the driver's reliability and equipment
4. Make a clear rate proposal
5. Be concise (under 200 words)
6. Match the ${strategy} strategy tone

Return ONLY the email body text, no subject line or signatures.`;
}

/**
 * Call Amazon Bedrock to generate negotiation email
 */
async function generateNegotiationEmail(
  load: Load,
  driver: Driver,
  strategy: NegotiationStrategy
): Promise<string> {
  try {
    const prompt = buildNegotiationPrompt(load, driver, strategy);

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
    (enhancedError as any).operation = 'generateNegotiationEmail';
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add automation secret header if configured
    const automationSecret = process.env.N8N_AUTOMATION_SECRET;
    if (automationSecret) {
      headers['x-automation-secret'] = automationSecret;
    }
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
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
 * Lambda handler for starting negotiation
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  try {
    // Parse request body
    const body = parseBody<StartNegotiationRequest>(event.body);

    if (!body) {
      return badRequestError('Missing request body', undefined, requestId);
    }

    // Validate required fields
    const requiredFields = ['loadId', 'driverId', 'strategy'];
    const missingFields = requiredFields.filter(
      (field) => !body[field as keyof StartNegotiationRequest]
    );

    if (missingFields.length > 0) {
      return badRequestError(
        `Missing required fields: ${missingFields.join(', ')}`,
        { missingFields },
        requestId
      );
    }

    // Validate strategy
    const strategyValidation = validateNegotiationStrategy(body.strategy);
    if (!strategyValidation.valid) {
      return badRequestError(strategyValidation.error!, undefined, requestId);
    }

    logInfo('Processing negotiate request', {
      operation: 'negotiate',
      requestId,
      loadId: body.loadId,
      driverId: body.driverId,
      strategy: body.strategy,
    });

    // Retrieve load information
    const load = await getItem<Load>(getLoadsTableName(), { loadId: body.loadId });

    if (!load) {
      return badRequestError(`Load with ID ${body.loadId} not found`, undefined, requestId);
    }

    // Retrieve driver information
    const driver = await getItem<Driver>(getDriversTableName(), { driverId: body.driverId });

    if (!driver) {
      return badRequestError(`Driver with ID ${body.driverId} not found`, undefined, requestId);
    }

    // Generate negotiation ID
    const negotiationId = generateId('negotiation');
    const timestamp = getCurrentTimestamp();

    // Call Bedrock to generate first negotiation email
    let emailBody: string;
    try {
      emailBody = await generateNegotiationEmail(load, driver, body.strategy);
    } catch (error) {
      logError(error, {
        operation: 'negotiate',
        requestId,
        step: 'bedrockCall',
      });
      return serviceUnavailableError('AI service', requestId);
    }

    // Create first offer
    const firstOffer: Offer = {
      round: 1,
      amount: driver.minRate,
      sender: 'driver',
      timestamp,
      emailBody,
    };

    // Get n8n webhook URL from environment
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      logError(new Error('N8N_WEBHOOK_URL not configured'), {
        operation: 'negotiate',
        requestId,
        step: 'webhookConfig',
      });
      return internalServerError('Email service not configured', requestId);
    }

    // Send email to n8n webhook (skip if localhost for testing)
    const isLocalhost = n8nWebhookUrl.includes('localhost') || n8nWebhookUrl.includes('127.0.0.1');
    
    if (!isLocalhost) {
      try {
        await sendToN8nWebhook(n8nWebhookUrl, {
          to: load.broker.email,
          subject: `Rate Negotiation for Load ${load.loadId} - ${load.origin.city} to ${load.destination.city}`,
          body: emailBody,
          loadId: load.loadId,
          negotiationId,
        });
      } catch (error) {
        logError(error, {
          operation: 'negotiate',
          requestId,
          step: 'webhookSend',
        });
        return serviceUnavailableError('Email service', requestId);
      }
    } else {
      logInfo('Skipping webhook call (localhost URL detected - for testing only)', {
        operation: 'negotiate',
        requestId,
        webhookUrl: n8nWebhookUrl,
      });
    }

    // Create negotiation record
    const negotiation: Negotiation = {
      negotiationId,
      loadId: body.loadId,
      driverId: body.driverId,
      brokerEmail: load.broker.email,
      driverMinRate: driver.minRate,
      marketRate: load.marketRateAvg,
      postedRate: load.postedRate,
      maxRounds: 5, // Default max rounds
      currentRound: 1,
      strategy: body.strategy,
      status: 'in_progress',
      offers: [firstOffer],
      n8nWebhookUrl,
    };

    // Store negotiation in DynamoDB
    try {
      await putItem(getNegotiationsTableName(), negotiation);
    } catch (error) {
      logError(error, {
        operation: 'negotiate',
        requestId,
        step: 'dynamodbPut',
      });
      return internalServerError('Failed to create negotiation', requestId);
    }

    // Build response
    const response: StartNegotiationResponse = {
      negotiationId,
      status: 'in_progress',
      initialOffer: {
        round: 1,
        amount: driver.minRate,
        emailBody,
      },
    };

    logInfo('Negotiation started successfully', {
      operation: 'negotiate',
      requestId,
      negotiationId,
      loadId: body.loadId,
      driverId: body.driverId,
    });

    return successResponse(response, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'negotiate',
      requestId,
    });
    return internalServerError('Failed to start negotiation', requestId);
  }
}
