// Driver Documents Lambda - GET /driver/{driverId}/documents
// Retrieves all documents for a driver with presigned S3 URLs

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    badRequestError,
    Document,
    DocumentWithUrl,
    DriverDocumentsResponse,
    generatePresignedUrl,
    generateRequestId,
    getDocumentsBucketName,
    getDocumentsTableName,
    internalServerError,
    logError,
    logInfo,
    scanTable,
    successResponse,
} from './shared';

/**
 * Lambda handler for driver documents
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

    logInfo('Processing driver documents request', {
      operation: 'driverDocuments',
      requestId,
      driverId,
    });

    // Query Documents table for all driver's documents
    const { items: documents } = await scanTable<Document>(
      getDocumentsTableName(),
      '#driverId = :driverId',
      { '#driverId': 'driverId' },
      { ':driverId': driverId }
    );

    logInfo('Retrieved documents from DynamoDB', {
      operation: 'driverDocuments',
      requestId,
      driverId,
      documentCount: documents.length,
    });

    // Get S3 bucket name
    const bucketName = getDocumentsBucketName();

    // Generate presigned URLs for each document (1 hour expiry)
    const documentsWithUrls: DocumentWithUrl[] = await Promise.all(
      documents.map(async (doc) => {
        try {
          const downloadUrl = await generatePresignedUrl(
            bucketName,
            doc.s3Key,
            3600 // 1 hour expiry
          );

          return {
            ...doc,
            downloadUrl,
          };
        } catch (error) {
          // Log error but continue processing other documents
          logError(error, {
            operation: 'driverDocuments',
            requestId,
            docId: doc.docId,
            s3Key: doc.s3Key,
          });

          // Return document without URL if presigned URL generation fails
          return {
            ...doc,
            downloadUrl: '',
          };
        }
      })
    );

    // Build response
    const response: DriverDocumentsResponse = {
      documents: documentsWithUrls,
    };

    logInfo('Driver documents retrieved successfully', {
      operation: 'driverDocuments',
      requestId,
      driverId,
      documentCount: documentsWithUrls.length,
    });

    return successResponse(response, 200, requestId);
  } catch (error) {
    logError(error, {
      operation: 'driverDocuments',
      requestId,
      driverId: event.pathParameters?.driverId,
    });
    return internalServerError('Failed to retrieve driver documents', requestId);
  }
}
