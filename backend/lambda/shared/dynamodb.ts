// DynamoDB client wrapper with error handling

import {
    DeleteItemCommand,
    DeleteItemCommandInput,
    DynamoDBClient,
    GetItemCommand,
    GetItemCommandInput,
    PutItemCommand,
    PutItemCommandInput,
    QueryCommand,
    QueryCommandInput,
    ScanCommand,
    ScanCommandInput,
    TransactWriteItemsCommand,
    TransactWriteItemsCommandInput,
    UpdateItemCommand,
    UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Get item from DynamoDB table
 */
export async function getItem<T>(
  tableName: string,
  key: Record<string, any>
): Promise<T | null> {
  try {
    const params: GetItemCommandInput = {
      TableName: tableName,
      Key: marshall(key),
    };

    const result = await dynamoClient.send(new GetItemCommand(params));

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as T;
  } catch (error) {
    const err = error as any;
    console.error('DynamoDB getItem error:', {
      tableName,
      key,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`DynamoDB operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'getItem';
    (enhancedError as any).tableName = tableName;
    throw enhancedError;
  }
}

/**
 * Put item into DynamoDB table
 */
export async function putItem<T>(
  tableName: string,
  item: T
): Promise<void> {
  try {
    const params: PutItemCommandInput = {
      TableName: tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    };

    await dynamoClient.send(new PutItemCommand(params));
  } catch (error) {
    const err = error as any;
    console.error('DynamoDB putItem error:', {
      tableName,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`DynamoDB operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'putItem';
    (enhancedError as any).tableName = tableName;
    throw enhancedError;
  }
}

/**
 * Update item in DynamoDB table
 */
export async function updateItem(
  tableName: string,
  key: Record<string, any>,
  updateExpression: string,
  expressionAttributeNames?: Record<string, string>,
  expressionAttributeValues?: Record<string, any>,
  conditionExpression?: string
): Promise<void> {
  try {
    const params: UpdateItemCommandInput = {
      TableName: tableName,
      Key: marshall(key),
      UpdateExpression: updateExpression,
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
      ...(expressionAttributeValues && {
        ExpressionAttributeValues: marshall(expressionAttributeValues, { removeUndefinedValues: true }),
      }),
      ...(conditionExpression && { ConditionExpression: conditionExpression }),
    };

    await dynamoClient.send(new UpdateItemCommand(params));
  } catch (error) {
    const err = error as any;
    console.error('DynamoDB updateItem error:', {
      tableName,
      key,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Check for conditional check failure
    if (err.name === 'ConditionalCheckFailedException') {
      const conditionalError = new Error('Conditional check failed');
      (conditionalError as any).isConditionalCheckFailure = true;
      (conditionalError as any).originalError = err;
      throw conditionalError;
    }
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`DynamoDB operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'updateItem';
    (enhancedError as any).tableName = tableName;
    throw enhancedError;
  }
}

/**
 * Delete item from DynamoDB table
 */
export async function deleteItem(
  tableName: string,
  key: Record<string, any>
): Promise<void> {
  try {
    const params: DeleteItemCommandInput = {
      TableName: tableName,
      Key: marshall(key),
    };

    await dynamoClient.send(new DeleteItemCommand(params));
  } catch (error) {
    const err = error as any;
    console.error('DynamoDB deleteItem error:', {
      tableName,
      key,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`DynamoDB operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'deleteItem';
    (enhancedError as any).tableName = tableName;
    throw enhancedError;
  }
}

/**
 * Scan DynamoDB table with optional filters
 */
export async function scanTable<T>(
  tableName: string,
  filterExpression?: string,
  expressionAttributeNames?: Record<string, string>,
  expressionAttributeValues?: Record<string, any>,
  limit?: number,
  exclusiveStartKey?: Record<string, any>
): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, any> }> {
  try {
    const params: ScanCommandInput = {
      TableName: tableName,
      ...(filterExpression && { FilterExpression: filterExpression }),
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
      ...(expressionAttributeValues && {
        ExpressionAttributeValues: marshall(expressionAttributeValues, { removeUndefinedValues: true }),
      }),
      ...(limit && { Limit: limit }),
      ...(exclusiveStartKey && { ExclusiveStartKey: marshall(exclusiveStartKey) }),
    };

    const result = await dynamoClient.send(new ScanCommand(params));

    const items = result.Items?.map((item) => unmarshall(item) as T) || [];
    const lastEvaluatedKey = result.LastEvaluatedKey
      ? unmarshall(result.LastEvaluatedKey)
      : undefined;

    return { items, lastEvaluatedKey };
  } catch (error) {
    const err = error as any;
    console.error('DynamoDB scan error:', {
      tableName,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`DynamoDB operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'scanTable';
    (enhancedError as any).tableName = tableName;
    throw enhancedError;
  }
}

/**
 * Query DynamoDB table
 */
export async function queryTable<T>(
  tableName: string,
  keyConditionExpression: string,
  expressionAttributeNames?: Record<string, string>,
  expressionAttributeValues?: Record<string, any>,
  filterExpression?: string,
  limit?: number,
  exclusiveStartKey?: Record<string, any>
): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, any> }> {
  try {
    const params: QueryCommandInput = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
      ...(expressionAttributeValues && {
        ExpressionAttributeValues: marshall(expressionAttributeValues, { removeUndefinedValues: true }),
      }),
      ...(filterExpression && { FilterExpression: filterExpression }),
      ...(limit && { Limit: limit }),
      ...(exclusiveStartKey && { ExclusiveStartKey: marshall(exclusiveStartKey) }),
    };

    const result = await dynamoClient.send(new QueryCommand(params));

    const items = result.Items?.map((item) => unmarshall(item) as T) || [];
    const lastEvaluatedKey = result.LastEvaluatedKey
      ? unmarshall(result.LastEvaluatedKey)
      : undefined;

    return { items, lastEvaluatedKey };
  } catch (error) {
    const err = error as any;
    console.error('DynamoDB query error:', {
      tableName,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`DynamoDB operation failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'queryTable';
    (enhancedError as any).tableName = tableName;
    throw enhancedError;
  }
}

/**
 * Execute a transaction with multiple write operations
 */
export async function transactWrite(
  transactItems: TransactWriteItemsCommandInput['TransactItems']
): Promise<void> {
  try {
    const params: TransactWriteItemsCommandInput = {
      TransactItems: transactItems,
    };

    await dynamoClient.send(new TransactWriteItemsCommand(params));
  } catch (error) {
    const err = error as any;
    console.error('DynamoDB transactWrite error:', {
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.$metadata?.httpStatusCode,
    });
    
    // Check for transaction cancellation
    if (err.name === 'TransactionCanceledException') {
      const reasons = err.CancellationReasons;
      console.error('Transaction cancelled:', reasons);
      
      // Check if any reason is ConditionalCheckFailed
      const hasConditionalCheckFailure = reasons?.some(
        (reason: any) => reason.Code === 'ConditionalCheckFailed'
      );
      
      if (hasConditionalCheckFailure) {
        const conditionalError = new Error('Transaction failed: Conditional check failed');
        (conditionalError as any).isConditionalCheckFailure = true;
        (conditionalError as any).originalError = err;
        (conditionalError as any).cancellationReasons = reasons;
        throw conditionalError;
      }
      
      const transactionError = new Error(`Transaction cancelled: ${JSON.stringify(reasons)}`);
      (transactionError as any).originalError = err;
      (transactionError as any).cancellationReasons = reasons;
      throw transactionError;
    }
    
    // Throw with more context for upstream error handling
    const enhancedError = new Error(`DynamoDB transaction failed: ${err.message}`);
    (enhancedError as any).originalError = err;
    (enhancedError as any).operation = 'transactWrite';
    throw enhancedError;
  }
}

/**
 * Get table name from environment variable
 */
export function getTableName(tableKey: string): string {
  const tableName = process.env[tableKey];
  if (!tableName) {
    throw new Error(`Environment variable ${tableKey} is not set`);
  }
  return tableName;
}

// Export table name getters
export const getLoadsTableName = () => getTableName('LOADS_TABLE_NAME');
export const getDriversTableName = () => getTableName('DRIVERS_TABLE_NAME');
export const getNegotiationsTableName = () => getTableName('NEGOTIATIONS_TABLE_NAME');
export const getDocumentsTableName = () => getTableName('DOCUMENTS_TABLE_NAME');
export const getBookingsTableName = () => getTableName('BOOKINGS_TABLE_NAME');
