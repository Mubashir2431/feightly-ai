// Voice Input Lambda - Transcribe audio to text and parse intent
// Uses OpenAI Whisper for speech-to-text, then calls copilot logic

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    generateRequestId,
    internalServerError,
    logError,
    logInfo,
    serviceUnavailableError,
    successResponse,
} from './shared/response';
import { calculateDistance } from './shared/utils';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_WHISPER_MODEL = process.env.OPENAI_WHISPER_MODEL || 'whisper-1'; // Can be changed to large-v3-turbo

// Major city coordinates (same as copilot)
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

interface VoiceRequest {
  audioBase64: string;
  driverId: string;
  contentType?: string;
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
 * Transcribe audio using OpenAI Whisper API
 */
async function transcribeAudioWithWhisper(
  audioBase64: string,
  requestId: string
): Promise<string> {
  try {
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    logInfo('Starting Whisper transcription', {
      operation: 'transcribeWhisper',
      requestId,
      audioSize: audioBuffer.length,
      model: OPENAI_WHISPER_MODEL,
    });

    // Create form data for OpenAI API
    const formData = new FormData();
    
    // Create a Blob from the buffer
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', OPENAI_WHISPER_MODEL);
    formData.append('language', 'en');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Whisper API error: ${response.status} - ${errorText}`);
    }

    const result: any = await response.json();
    const transcript = result.text;

    logInfo('Whisper transcription completed', {
      operation: 'transcribeWhisper',
      requestId,
      transcriptLength: transcript.length,
    });

    return transcript;
  } catch (error: any) {
    logError(error, {
      operation: 'transcribeWhisper',
      requestId,
    });
    throw error;
  }
}

/**
 * Parse intent using Bedrock (same logic as copilot Lambda)
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
- notes: string with any other context`;

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
    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content[0].text;
    
    // Clean up markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const parsed = JSON.parse(cleanContent.trim());
    
    return parsed as ParsedIntent;
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
 * Build search parameters from parsed intent
 */
function buildSearchParams(parsed: ParsedIntent): SearchParams {
  const params: SearchParams = {};

  if (parsed.originCity) params.originCity = parsed.originCity;
  if (parsed.destCity) params.destCity = parsed.destCity;
  if (parsed.equipment) params.equipment = parsed.equipment;
  if (parsed.minRate !== null && parsed.minRate !== undefined) params.minRate = parsed.minRate;
  if (parsed.maxDeadhead !== null && parsed.maxDeadhead !== undefined) params.maxDeadhead = parsed.maxDeadhead;

  return params;
}

/**
 * Generate copilot message
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

    const body: VoiceRequest = JSON.parse(event.body);

    // Validate required fields
    if (!body.audioBase64 || typeof body.audioBase64 !== 'string') {
      return badRequestError('Field "audioBase64" is required and must be a string', undefined, requestId);
    }

    if (!body.driverId || typeof body.driverId !== 'string') {
      return badRequestError('Field "driverId" is required and must be a string', undefined, requestId);
    }

    logInfo('Processing voice input request', {
      operation: 'voiceInput',
      requestId,
      driverId: body.driverId,
      audioSize: body.audioBase64.length,
    });

    // Check if OpenAI API key is configured
    if (!OPENAI_API_KEY) {
      logError(new Error('OPENAI_API_KEY not configured'), {
        operation: 'voiceInput',
        requestId,
      });
      return internalServerError('Speech-to-text service not configured', requestId);
    }

    // Transcribe audio using OpenAI Whisper
    let transcript: string;
    try {
      transcript = await transcribeAudioWithWhisper(body.audioBase64, requestId);
    } catch (error: any) {
      logError(error, {
        operation: 'voiceInput',
        requestId,
        step: 'whisperTranscription',
      });
      return serviceUnavailableError('Speech-to-text service', requestId);
    }

    // Parse intent using Bedrock
    let parsed: ParsedIntent;
    try {
      parsed = await parseIntentWithBedrock(transcript, requestId);
    } catch (error: any) {
      if (error.name === 'ThrottlingException' || error.name === 'ServiceUnavailableException') {
        return serviceUnavailableError('Bedrock', requestId);
      }
      return internalServerError('Failed to parse intent', requestId);
    }

    // Reverse geocode if needed
    if (!parsed.originCity && body.currentLat !== undefined && body.currentLng !== undefined) {
      const nearest = findNearestCity(body.currentLat, body.currentLng);
      parsed.originCity = nearest.city;
      parsed.originState = nearest.state;
    }

    // Build search parameters and copilot message
    const searchParams = buildSearchParams(parsed);
    const copilotMessage = generateCopilotMessage(parsed);

    logInfo('Voice input processed successfully', {
      operation: 'voiceInput',
      requestId,
      transcriptLength: transcript.length,
      tripType: parsed.tripType,
    });

    return successResponse(
      {
        transcript,
        parsed,
        searchParams,
        copilotMessage,
      },
      200,
      requestId
    );
  } catch (error: any) {
    logError(error, {
      operation: 'voiceInput',
      requestId,
    });
    return internalServerError('An unexpected error occurred', requestId);
  }
};
