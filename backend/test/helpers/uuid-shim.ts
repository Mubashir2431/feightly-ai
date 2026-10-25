import { randomUUID } from 'crypto';

// Test-only stand-in for the ESM-only `uuid` package (see jest.config.js).
export const v4 = (): string => randomUUID();
