// API Response utilities for Feightly.ai

import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, ErrorResponse } from './types';

/**
 * CORS headers for API responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // TODO: Restrict in production
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
};

/**
 * Generates a unique request ID
 */
export function generateRequestId(): string {
  return uuidv4();
}

/**
 * Creates a successful API response
 */
export function successResponse<T>(
  data: T,
  statusCode: number = 200,
  requestId?: string
): ApiResponse<T> {
  const reqId = requestId || generateRequestId();
  
  // Add requestId to response body
  const responseBody = {
    ...data,
    requestId: reqId,
  };
  
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'X-Request-Id': reqId,
    },
    body: JSON.stringify(responseBody),
  };
}

/**
 * Creates an error API response
 */
export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: any,
  requestId?: string
): ApiResponse<ErrorResponse> {
  const errorBody: ErrorResponse = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
    requestId: requestId || generateRequestId(),
  };

  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'X-Request-Id': errorBody.requestId,
    },
    body: JSON.stringify(errorBody),
  };
}

/**
 * Creates a 400 Bad Request error response
 */
export function badRequestError(
  message: string,
  details?: any,
  requestId?: string
): ApiResponse<ErrorResponse> {
  return errorResponse(400, 'BAD_REQUEST', message, details, requestId);
}

/**
 * Creates a 404 Not Found error response
 */
export function notFoundError(
  resource: string,
  id: string,
  requestId?: string
): ApiResponse<ErrorResponse> {
  return errorResponse(
    404,
    `${resource.toUpperCase()}_NOT_FOUND`,
    `${resource} with ID ${id} not found`,
    undefined,
    requestId
  );
}

/**
 * Creates a 409 Conflict error response
 */
export function conflictError(
  message: string,
  requestId?: string
): ApiResponse<ErrorResponse> {
  return errorResponse(409, 'CONFLICT', message, undefined, requestId);
}

/**
 * Creates a 500 Internal Server Error response
 */
export function internalServerError(
  message: string = 'Internal server error',
  requestId?: string
): ApiResponse<ErrorResponse> {
  return errorResponse(500, 'INTERNAL_SERVER_ERROR', message, undefined, requestId);
}

/**
 * Creates a 503 Service Unavailable error response
 */
export function serviceUnavailableError(
  service: string,
  requestId?: string
): ApiResponse<ErrorResponse> {
  return errorResponse(
    503,
    'SERVICE_UNAVAILABLE',
    `${service} is temporarily unavailable`,
    undefined,
    requestId
  );
}

/**
 * Creates a 504 Gateway Timeout error response
 */
export function gatewayTimeoutError(
  requestId?: string
): ApiResponse<ErrorResponse> {
  return errorResponse(
    504,
    'GATEWAY_TIMEOUT',
    'Request timeout exceeded',
    undefined,
    requestId
  );
}

/**
 * Validates required fields and returns error response if validation fails
 */
export function validateRequiredFieldsResponse(
  body: any,
  requiredFields: string[],
  requestId?: string
): ApiResponse<ErrorResponse> | null {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return badRequestError(
      `Missing required fields: ${missingFields.join(', ')}`,
      { missingFields },
      requestId
    );
  }

  return null;
}

/**
 * Logs error with context
 */
export function logError(
  error: any,
  context: {
    operation: string;
    requestId: string;
    [key: string]: any;
  }
): void {
  const err = error as any;
  console.error(JSON.stringify({
    level: 'ERROR',
    timestamp: new Date().toISOString(),
    operation: context.operation,
    requestId: context.requestId,
    error: {
      message: err.message || 'Unknown error',
      name: err.name,
      stack: err.stack,
      // Include AWS SDK error details if available
      ...(err.$metadata && {
        httpStatusCode: err.$metadata.httpStatusCode,
        requestId: err.$metadata.requestId,
        attempts: err.$metadata.attempts,
      }),
      // Include enhanced error context if available
      ...(err.operation && { operation: err.operation }),
      ...(err.tableName && { tableName: err.tableName }),
      ...(err.bucketName && { bucketName: err.bucketName }),
      ...(err.key && { key: err.key }),
      ...(err.isConditionalCheckFailure !== undefined && {
        isConditionalCheckFailure: err.isConditionalCheckFailure,
      }),
      ...(err.cancellationReasons && {
        cancellationReasons: err.cancellationReasons,
      }),
    },
    context,
  }));
}

/**
 * Logs info with context
 */
export function logInfo(
  message: string,
  context: {
    operation: string;
    requestId: string;
    [key: string]: any;
  }
): void {
  console.log(JSON.stringify({
    level: 'INFO',
    timestamp: new Date().toISOString(),
    message,
    operation: context.operation,
    requestId: context.requestId,
    context,
  }));
}
