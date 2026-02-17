// S3 client wrapper with error handling

import {
    DeleteObjectCommand,
    DeleteObjectCommandInput,
    GetObjectCommand,
    GetObjectCommandInput,
    PutObjectCommand,
    PutObjectCommandInput,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Upload file to S3
 */
export async function uploadToS3(
  bucketName: string,
  key: string,
  body: string | Buffer,
  contentType: string = 'application/octet-stream'
): Promise<void> {
  try {
    const params: PutObjectCommandInput = {
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    };

    await s3Client.send(new PutObjectCommand(params));
  } catch (error) {
    const err = error as any;
    console.error('S3 upload error:', {
      bucketName,
      key,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`S3 operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'uploadToS3';
    (enhancedError as any).bucketName = bucketName;
    (enhancedError as any).key = key;
    throw enhancedError;
  }
}

/**
 * Get file from S3
 */
export async function getFromS3(
  bucketName: string,
  key: string
): Promise<string> {
  try {
    const params: GetObjectCommandInput = {
      Bucket: bucketName,
      Key: key,
    };

    const result = await s3Client.send(new GetObjectCommand(params));
    
    if (!result.Body) {
      throw new Error('Empty response from S3');
    }

    return await result.Body.transformToString();
  } catch (error) {
    const err = error as any;
    console.error('S3 get error:', {
      bucketName,
      key,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`S3 operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'getFromS3';
    (enhancedError as any).bucketName = bucketName;
    (enhancedError as any).key = key;
    throw enhancedError;
  }
}

/**
 * Delete file from S3
 */
export async function deleteFromS3(
  bucketName: string,
  key: string
): Promise<void> {
  try {
    const params: DeleteObjectCommandInput = {
      Bucket: bucketName,
      Key: key,
    };

    await s3Client.send(new DeleteObjectCommand(params));
  } catch (error) {
    const err = error as any;
    console.error('S3 delete error:', {
      bucketName,
      key,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`S3 operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'deleteFromS3';
    (enhancedError as any).bucketName = bucketName;
    (enhancedError as any).key = key;
    throw enhancedError;
  }
}

/**
 * Generate presigned URL for S3 object
 */
export async function generatePresignedUrl(
  bucketName: string,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    const err = error as any;
    console.error('S3 presigned URL error:', {
      bucketName,
      key,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`S3 operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'generatePresignedUrl';
    (enhancedError as any).bucketName = bucketName;
    (enhancedError as any).key = key;
    throw enhancedError;
  }
}

/**
 * Get S3 bucket name from environment variable
 */
export function getDocumentsBucketName(): string {
  const bucketName = process.env.DOCUMENTS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('Environment variable DOCUMENTS_BUCKET_NAME is not set');
  }
  return bucketName;
}
