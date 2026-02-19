// Copilot Lambda - Natural language to structured search parameters
// Uses Amazon Bedrock (Claude 3 Haiku) to parse driver intent

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    generateRequestId,
    internalServerError,
    logError,
    logInfo,
    serviceUnavailableError,
    successResponse
} from './shared/response';
import { calculateDistance } from './shared/utils';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

// Major city coordinates for reverse geocoding
const MAJOR_CITIES = [
  { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
  { city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
  { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
  { city: 'Memphis', state: 'TN', lat: 35.1495, lng: -90.049 },
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431 },
  { city: 'Jacksonville', state: 'FL', lat: 30.3322, lng: -81.6557 },
  { city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816 },
  { city: 'Indianapolis', state: 'IN', lat: 39.7684, lng: -86.1581 },
  { city: 'Kansas City', state: 'MO', lat: 39.0997, lng: -94.5786 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.074 },
];

interface CopilotRequest {
  text: string;
  driverId: string;
  currentLat?: number;
  currentLng?: number;
}

interface ParsedIntent {
  tripType: 'one_way' | 'round_trip' | 'open_ended' | 'backhaul' | 'multi_day';
  originCity: string | null;
  originState: string | null;
  destCity: string | null;
  destState: string | null;
  equipment: 'Dry Van' | 'Reefer' | 'Flatbed' | null;
  minRate: number | null;
  maxDeadhead: number | null;
  homeCity: string | null;
  homeState: string | null;
  timeConstraint: string | null;
  avoidRegions: string[] | null;
  notes: string;
}

interface SearchParams {
  originCity?: string;
  destCity?: string;
  equipment?: string;
  minRate?: number;
  maxDeadhead?: number;
  bookingType?: string;
}

/**
 * Find nearest major city to given coordinates
 */
function findNearestCity(lat: number, lng: number): { city: string; state: string } {
  let nearestCity = MAJOR_CITIES[0];
  let minDistance = calculateDistance(lat, lng, nearestCity.lat, nearestCity.lng);

  for (const city of MAJOR_CITIES) {
    const distance = calculateDistance(lat, lng, city.lat, city.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  }

  return { city: nearestCity.city, state: nearestCity.state };
}

/**
 * Call Amazon Bedrock to parse natural language into structured intent
 */
async function parseIntentWithBedrock(text: string, requestId: string): Promise<ParsedIntent> {
  const systemPrompt = `You are a trucking AI copilot. Parse the driver's message and extract structured trip parameters. Return ONLY valid JSON, no other text.

The JSON must have these fields:
- tripType: one of "one_way", "round_trip", "open_ended", "backhaul", "multi_day"
- originCity: string or null
- originState: 2-letter state code or null  
- destCity: string or null
- destState: 2-letter state code or null
- equipment: "Dry Van", "Reefer", or "Flatbed" or null
- minRate: number (dollars per mile) or null
- maxDeadhead: number (miles) or null
- homeCity: string or null (for backhaul/round trip)
- homeState: string or null
- timeConstraint: string or null (e.g. "by Friday", "within 2 days")
- avoidRegions: array of strings or null (e.g. ["Northeast", "I-80 Wyoming"])
- notes: string with any other context

Examples:
Input: 'Dallas to Atlanta, dry van, two thirty minimum'
Output: {"tripType":"one_way","originCity":"Dallas","originState":"TX","destCity":"Atlanta","destState":"GA","equipment":"Dry Van","minRate":2.30,"maxDeadhead":null,"homeCity":null,"homeState":null,"timeConstraint":null,"avoidRegions":null,"notes":""}

Input: 'What loads are available near me?'
Output: {"tripType":"open_ended","originCity":null,"originState":null,"destCity":null,"destState":null,"equipment":null,"minRate":null,"maxDeadhead":50,"homeCity":null,"homeState":null,"timeConstraint":null,"avoidRegions":null,"notes":"Use driver current location"}

Input: 'I need to get home to Dallas from Miami'
Output: {"tripType":"backhaul","originCity":"Miami","originState":"FL","destCity":"Dallas","destState":"TX","equipment":null,"minRate":null,"maxDeadhead":null,"homeCity":"Dallas","homeState":"TX","timeConstraint":null,"avoidRegions":null,"notes":"Driver wants to get home, optimize for homeward direction"}

Input: 'Round trip Dallas to Atlanta and back, need to be home by Friday'
Output: {"tripType":"round_trip","originCity":"Dallas","originState":"TX","destCity":"Atlanta","destState":"GA","equipment":null,"minRate":null,"maxDeadhead":null,"homeCity":"Dallas","homeState":"TX","timeConstraint":"by Friday","avoidRegions":null,"notes":""}

Input: 'Anything going toward Chicago but avoid the Northeast, reefer only'
Output: {"tripType":"one_way","originCity":null,"originState":null,"destCity":"Chicago","destState":"IL","equipment":"Reefer","minRate":null,"maxDeadhead":null,"homeCity":null,"homeState":null,"timeConstraint":null,"avoidRegions":["Northeast"],"notes":"Driver wants loads heading toward Chicago direction"}`;

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1000,
    temperature: 0.1,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: text,
      },
    ],
  };

  try {
    logInfo('Calling Bedrock to parse intent', {
      operation: 'parseIntent',
      requestId,
      text,
      modelId: BEDROCK_MODEL_ID,
    });

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    logInfo('Bedrock response received', {
      operation: 'parseIntent',
      requestId,
      stopReason: responseBody.stop_reason,
    });

    // Extract the text content from Claude's response
    const content = responseBody.content[0].text;
    
    logInfo('Raw Bedrock content', {
      operation: 'parseIntent',
      requestId,
      content: content.substring(0, 500), // Log first 500 chars
    });
    
    // Clean up markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    logInfo('Cleaned content', {
      operation: 'parseIntent',
      requestId,
      cleanContent: cleanContent.substring(0, 500),
    });
    
    // Parse the JSON from Claude's response
    try {
      const parsed = JSON.parse(cleanContent.trim());
      return parsed as ParsedIntent;
    } catch (parseError: any) {
      logError(parseError, {
        operation: 'parseIntent',
        requestId,
        text,
        cleanContent: cleanContent.substring(0, 1000),
        parseErrorMessage: parseError.message,
      });
      throw new Error(`JSON parse failed: ${parseError.message}`);
    }
  } catch (error: any) {
    logError(error, {
      operation: 'parseIntent',
      requestId,
      text,
    });
    throw error;
  }
}

/**
 * Convert parsed intent to search parameters for load-search API
 */
function buildSearchParams(parsed: ParsedIntent): SearchParams {
  const params: SearchParams = {};

  if (parsed.originCity) {
    params.originCity = parsed.originCity;
  }

  if (parsed.destCity) {
    params.destCity = parsed.destCity;
  }

  if (parsed.equipment) {
    params.equipment = parsed.equipment;
  }

  if (parsed.minRate !== null && parsed.minRate !== undefined) {
    params.minRate = parsed.minRate;
  }

  if (parsed.maxDeadhead !== null && parsed.maxDeadhead !== undefined) {
    params.maxDeadhead = parsed.maxDeadhead;
  }

  return params;
}

/**
 * Generate a friendly copilot message confirming what was understood
 */
function generateCopilotMessage(parsed: ParsedIntent): string {
  const parts: string[] = [];

  if (parsed.tripType === 'backhaul') {
    parts.push('Got it! Looking for loads to get you home');
  } else if (parsed.tripType === 'round_trip') {
    parts.push('Looking for round trip loads');
  } else if (parsed.tripType === 'open_ended') {
    parts.push('Searching for available loads');
  } else {
    parts.push('Looking for loads');
  }

  if (parsed.originCity && parsed.originState) {
    parts.push(`from ${parsed.originCity}, ${parsed.originState}`);
  }

  if (parsed.destCity && parsed.destState) {
    parts.push(`to ${parsed.destCity}, ${parsed.destState}`);
  }

  if (parsed.equipment) {
    parts.push(`(${parsed.equipment})`);
  }

  if (parsed.minRate) {
    parts.push(`at $${parsed.minRate.toFixed(2)}/mile or better`);
  }

  if (parsed.timeConstraint) {
    parts.push(`- need to arrive ${parsed.timeConstraint}`);
  }

  if (parsed.avoidRegions && parsed.avoidRegions.length > 0) {
    parts.push(`- avoiding ${parsed.avoidRegions.join(', ')}`);
  }

  return parts.join(' ') + '...';
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

    const body: CopilotRequest = JSON.parse(event.body);

    // Validate required fields
    if (!body.text || typeof body.text !== 'string') {
      return badRequestError('Field "text" is required and must be a string', undefined, requestId);
    }

    if (!body.driverId || typeof body.driverId !== 'string') {
      return badRequestError('Field "driverId" is required and must be a string', undefined, requestId);
    }

    logInfo('Processing copilot request', {
      operation: 'copilot',
      requestId,
      driverId: body.driverId,
      textLength: body.text.length,
    });

    // Parse intent using Bedrock
    let parsed: ParsedIntent;
    try {
      parsed = await parseIntentWithBedrock(body.text, requestId);
    } catch (error: any) {
      if (error.name === 'ThrottlingException' || error.name === 'ServiceUnavailableException') {
        return serviceUnavailableError('Bedrock', requestId);
      }
      return internalServerError('Failed to parse intent', requestId);
    }

    // If originCity is null but we have current location, reverse geocode
    if (!parsed.originCity && body.currentLat !== undefined && body.currentLng !== undefined) {
      const nearest = findNearestCity(body.currentLat, body.currentLng);
      parsed.originCity = nearest.city;
      parsed.originState = nearest.state;
      
      logInfo('Reverse geocoded current location', {
        operation: 'copilot',
        requestId,
        lat: body.currentLat,
        lng: body.currentLng,
        nearestCity: nearest.city,
        nearestState: nearest.state,
      });
    }

    // Build search parameters
    const searchParams = buildSearchParams(parsed);

    // Generate friendly copilot message
    const copilotMessage = generateCopilotMessage(parsed);

    logInfo('Copilot request processed successfully', {
      operation: 'copilot',
      requestId,
      tripType: parsed.tripType,
      hasOrigin: !!parsed.originCity,
      hasDest: !!parsed.destCity,
    });

    return successResponse(
      {
        parsed,
        searchParams,
        copilotMessage,
      },
      200,
      requestId
    );
  } catch (error: any) {
    logError(error, {
      operation: 'copilot',
      requestId,
    });
    return internalServerError('An unexpected error occurred', requestId);
  }
};
