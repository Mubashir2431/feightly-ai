// Feightly.ai Data Model Types

// Location types
export interface Location {
  city: string;
  state: string;
  lat: number;
  lng: number;
  address: string;
}

export interface LocationBase {
  city: string;
  state: string;
  lat: number;
  lng: number;
}

// Broker information
export interface BrokerInfo {
  name: string;
  contact: string;
  email: string;
  phone: string;
  rating: number;
  paymentTerms: string;
  onTimePayment: number;
}

// Load types
export type EquipmentType = 'Dry Van' | 'Reefer' | 'Flatbed';
export type BookingType = 'book_now' | 'negotiable' | 'hot';
export type RateTrend = 'rising' | 'falling' | 'stable';
export type LoadStatus = 'available' | 'booked' | 'in_negotiation';

export interface Load {
  loadId: string;
  origin: Location;
  destination: Location;
  distanceMiles: number;
  equipment: EquipmentType;
  weightLbs: number;
  postedRate: number;
  marketRateAvg: number;
  marketRateHigh: number;
  marketRateLow: number;
  rateTrend: RateTrend;
  bookingType: BookingType;
  bookNowRate?: number;
  broker: BrokerInfo;
  pickupWindow: string;
  deliveryDeadline: string;
  status: LoadStatus;
}

// Driver types
export interface Driver {
  driverId: string;
  name: string;
  homeBase: LocationBase;
  currentLocation: LocationBase;
  equipment: string;
  preferredLanes: string[];
  avoidRegions: string[];
  minRate: number;
}

// Negotiation types
export type NegotiationStrategy = 'aggressive' | 'moderate' | 'conservative';
export type NegotiationStatus = 'in_progress' | 'accepted' | 'rejected' | 'walked_away';
export type OfferSender = 'driver' | 'broker';

export interface Offer {
  round: number;
  amount: number;
  sender: OfferSender;
  timestamp: string;
  emailBody: string;
}

export interface Negotiation {
  negotiationId: string;
  loadId: string;
  driverId: string;
  brokerEmail: string;
  driverMinRate: number;
  marketRate: number;
  postedRate: number;
  maxRounds: number;
  currentRound: number;
  strategy: NegotiationStrategy;
  status: NegotiationStatus;
  offers: Offer[];
  n8nWebhookUrl: string;
}

// Document types
export type DocumentType = 'rate_confirmation' | 'bol' | 'pod' | 'invoice';

export interface Document {
  docId: string;
  loadId: string;
  driverId: string;
  docType: DocumentType;
  s3Key: string;
  createdAt: string;
}

// Booking types
export type BookingStatus = 'confirmed' | 'in_transit' | 'delivered';

export interface Booking {
  bookingId: string;
  loadId: string;
  driverId: string;
  finalRate: number;
  status: BookingStatus;
  bookedAt: string;
  rateConDocId: string;
}

// API Request/Response types

export interface LoadSearchParams {
  originCity?: string;
  destCity?: string;
  equipment?: EquipmentType;
  minRate?: number;
  maxDeadhead?: number;
  bookingType?: BookingType;
  driverId?: string; // For maxDeadhead calculation
}

export interface LoadSearchResponse {
  loads: Load[];
  nextToken?: string;
  hasMore: boolean;
  requestId?: string; // Added by successResponse
}

export interface BookLoadRequest {
  driverId: string;
}

export interface BookLoadResponse {
  bookingId: string;
  loadId: string;
  finalRate: number;
  rateConDocId: string;
  status: BookingStatus;
  requestId?: string; // Added by successResponse
}

export interface StartNegotiationRequest {
  loadId: string;
  driverId: string;
  strategy: NegotiationStrategy;
}

export interface StartNegotiationResponse {
  negotiationId: string;
  status: NegotiationStatus;
  initialOffer: {
    round: number;
    amount: number;
    emailBody: string;
  };
  requestId?: string; // Added by successResponse
}

export interface BrokerResponseRequest {
  brokerEmail: string;
  emailBody: string;
  counterOffer?: number;
}

export interface BrokerResponseResponse {
  negotiationId: string;
  status: NegotiationStatus;
  currentRound: number;
  latestOffer?: {
    round: number;
    amount: number;
    sender: OfferSender;
  };
  bookingId?: string;
  requestId?: string; // Added by successResponse
}

export interface DriverDashboardResponse {
  driverId: string;
  totalEarnings: number;
  loadsCompleted: number;
  avgRate: number;
  requestId?: string; // Added by successResponse
}

export interface DocumentWithUrl extends Document {
  downloadUrl: string;
}

export interface DriverDocumentsResponse {
  documents: DocumentWithUrl[];
  requestId?: string; // Added by successResponse
}

// Error types
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  requestId: string;
}

// API Response wrapper
export interface ApiResponse<T = any> {
  statusCode: number;
  headers: {
    'Content-Type': string;
    'Access-Control-Allow-Origin': string;
    'Access-Control-Allow-Methods': string;
    'Access-Control-Allow-Headers': string;
    'X-Request-Id': string;
  };
  body: string; // JSON stringified T or ErrorResponse
}
