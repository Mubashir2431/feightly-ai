// Validation utilities for Feightly.ai

import {
    BookingStatus,
    BookingType,
    DocumentType,
    EquipmentType,
    LoadStatus,
    NegotiationStatus,
    NegotiationStrategy,
    RateTrend,
} from './types';

// Enum validation
const EQUIPMENT_TYPES: EquipmentType[] = ['Dry Van', 'Reefer', 'Flatbed'];
const BOOKING_TYPES: BookingType[] = ['book_now', 'negotiable', 'hot'];
const RATE_TRENDS: RateTrend[] = ['rising', 'falling', 'stable'];
const LOAD_STATUSES: LoadStatus[] = ['available', 'booked', 'in_negotiation'];
const NEGOTIATION_STRATEGIES: NegotiationStrategy[] = ['aggressive', 'moderate', 'conservative'];
const NEGOTIATION_STATUSES: NegotiationStatus[] = ['in_progress', 'accepted', 'rejected', 'walked_away'];
const BOOKING_STATUSES: BookingStatus[] = ['confirmed', 'in_transit', 'delivered'];
const DOCUMENT_TYPES: DocumentType[] = ['rate_confirmation', 'bol', 'pod', 'invoice'];

/**
 * Validates if a value is one of the allowed enum values
 */
export function validateEnum<T extends string>(
  value: any,
  allowedValues: readonly T[],
  fieldName: string
): { valid: boolean; error?: string } {
  if (typeof value !== 'string') {
    return {
      valid: false,
      error: `${fieldName} must be a string`,
    };
  }

  if (!allowedValues.includes(value as T)) {
    return {
      valid: false,
      error: `${fieldName} must be one of: ${allowedValues.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validates equipment type
 */
export function validateEquipment(equipment: any): { valid: boolean; error?: string } {
  return validateEnum(equipment, EQUIPMENT_TYPES, 'equipment');
}

/**
 * Validates booking type
 */
export function validateBookingType(bookingType: any): { valid: boolean; error?: string } {
  return validateEnum(bookingType, BOOKING_TYPES, 'bookingType');
}

/**
 * Validates rate trend
 */
export function validateRateTrend(rateTrend: any): { valid: boolean; error?: string } {
  return validateEnum(rateTrend, RATE_TRENDS, 'rateTrend');
}

/**
 * Validates load status
 */
export function validateLoadStatus(status: any): { valid: boolean; error?: string } {
  return validateEnum(status, LOAD_STATUSES, 'status');
}

/**
 * Validates negotiation strategy
 */
export function validateNegotiationStrategy(strategy: any): { valid: boolean; error?: string } {
  return validateEnum(strategy, NEGOTIATION_STRATEGIES, 'strategy');
}

/**
 * Validates negotiation status
 */
export function validateNegotiationStatus(status: any): { valid: boolean; error?: string } {
  return validateEnum(status, NEGOTIATION_STATUSES, 'status');
}

/**
 * Validates booking status
 */
export function validateBookingStatus(status: any): { valid: boolean; error?: string } {
  return validateEnum(status, BOOKING_STATUSES, 'status');
}

/**
 * Validates document type
 */
export function validateDocumentType(docType: any): { valid: boolean; error?: string } {
  return validateEnum(docType, DOCUMENT_TYPES, 'docType');
}

/**
 * Validates that a numeric value is positive
 */
export function validatePositiveNumber(
  value: any,
  fieldName: string
): { valid: boolean; error?: string } {
  if (typeof value !== 'number') {
    return {
      valid: false,
      error: `${fieldName} must be a number`,
    };
  }

  if (isNaN(value)) {
    return {
      valid: false,
      error: `${fieldName} must be a valid number`,
    };
  }

  if (value <= 0) {
    return {
      valid: false,
      error: `${fieldName} must be a positive number`,
    };
  }

  return { valid: true };
}

/**
 * Validates email format
 */
export function validateEmail(email: any): { valid: boolean; error?: string } {
  if (typeof email !== 'string') {
    return {
      valid: false,
      error: 'Email must be a string',
    };
  }

  // Basic email regex pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return {
      valid: false,
      error: 'Email must be in valid format (user@domain.tld)',
    };
  }

  return { valid: true };
}

/**
 * Validates required fields are present
 */
export function validateRequiredFields(
  obj: any,
  requiredFields: string[]
): { valid: boolean; missingFields?: string[] } {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
    };
  }

  return { valid: true };
}

/**
 * Validates ISO 8601 timestamp format
 */
export function validateTimestamp(timestamp: any): { valid: boolean; error?: string } {
  if (typeof timestamp !== 'string') {
    return {
      valid: false,
      error: 'Timestamp must be a string',
    };
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return {
      valid: false,
      error: 'Timestamp must be in ISO 8601 format',
    };
  }

  return { valid: true };
}

/**
 * Generates current timestamp in ISO 8601 format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}
