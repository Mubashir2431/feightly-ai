import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  ScanCommand,
  TransactionCanceledException,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { getTableName, scanTable, transactWrite, updateItem } from '../lambda/shared/dynamodb';
import { calculateDistance, chunkArray, parseBody, parseQueryParams, retryWithBackoff } from '../lambda/shared/utils';
import { CITIES } from './helpers/fixtures';

const ddb = mockClient(DynamoDBClient);

beforeEach(() => {
  ddb.reset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('calculateDistance (Haversine, miles)', () => {
  it('is zero for the same point', () => {
    expect(calculateDistance(32.7767, -96.797, 32.7767, -96.797)).toBe(0);
  });

  it('matches the known great-circle distance Dallas to Atlanta (~720 mi)', () => {
    const d = calculateDistance(CITIES.dallas.lat, CITIES.dallas.lng, CITIES.atlanta.lat, CITIES.atlanta.lng);
    expect(d).toBeGreaterThan(715);
    expect(d).toBeLessThan(725);
  });

  it('is symmetric and rounded to one decimal', () => {
    const a = calculateDistance(CITIES.memphis.lat, CITIES.memphis.lng, CITIES.chicago.lat, CITIES.chicago.lng);
    const b = calculateDistance(CITIES.chicago.lat, CITIES.chicago.lng, CITIES.memphis.lat, CITIES.memphis.lng);
    expect(a).toBe(b);
    expect(Math.round(a * 10) / 10).toBe(a);
  });
});

describe('request helpers', () => {
  it('parseQueryParams converts numeric strings and skips undefined', () => {
    expect(parseQueryParams({ minRate: '2.5', equipment: 'Reefer', x: undefined })).toEqual({ minRate: 2.5, equipment: 'Reefer' });
    expect(parseQueryParams(null)).toEqual({});
  });

  it('parseBody returns null for an empty body and throws on bad JSON', () => {
    expect(parseBody(null)).toBeNull();
    expect(parseBody('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseBody('{oops')).toThrow('Invalid JSON in request body');
  });

  it('chunkArray splits into fixed-size batches (DynamoDB batch limits)', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('retryWithBackoff retries until success and rethrows the last error', async () => {
    const flaky = jest.fn().mockRejectedValueOnce(new Error('1')).mockResolvedValue('ok');
    await expect(retryWithBackoff(flaky, 3, 1)).resolves.toBe('ok');
    expect(flaky).toHaveBeenCalledTimes(2);

    const broken = jest.fn().mockRejectedValue(new Error('always'));
    await expect(retryWithBackoff(broken, 2, 1)).rejects.toThrow('always');
    expect(broken).toHaveBeenCalledTimes(2);
  });
});

describe('DynamoDB wrapper error mapping', () => {
  it('flags a failed conditional update so handlers can return 409', async () => {
    ddb.on(UpdateItemCommand).rejects(new ConditionalCheckFailedException({ message: 'cond', $metadata: {} }));

    await expect(updateItem('Loads', { loadId: 'L1' }, 'SET #s = :b', { '#s': 'status' }, { ':b': 'booked' }, '#s = :a'))
      .rejects.toMatchObject({ isConditionalCheckFailure: true });

    const input = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(input.ConditionExpression).toBe('#s = :a');
    expect(input.ExpressionAttributeValues).toEqual(marshall({ ':b': 'booked' }));
  });

  it('flags a transaction cancelled by a conditional check', async () => {
    ddb.on(TransactWriteItemsCommand).rejects(new TransactionCanceledException({
      message: 'x', $metadata: {}, CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
    }));
    await expect(transactWrite([])).rejects.toMatchObject({ isConditionalCheckFailure: true });
  });

  it('does not flag other transaction failures as conflicts', async () => {
    ddb.on(TransactWriteItemsCommand).rejects(new Error('network'));
    const err = await transactWrite([]).catch(e => e);
    expect(err.isConditionalCheckFailure).toBeUndefined();
    expect(err.message).toContain('DynamoDB transaction failed');
  });

  it('scanTable unmarshalls items and the pagination key', async () => {
    ddb.on(ScanCommand).resolves({ Items: [marshall({ loadId: 'L1', postedRate: 2.5 })], LastEvaluatedKey: marshall({ loadId: 'L1' }) });
    await expect(scanTable('Loads')).resolves.toEqual({ items: [{ loadId: 'L1', postedRate: 2.5 }], lastEvaluatedKey: { loadId: 'L1' } });
  });

  it('getTableName fails fast when the env var is missing', () => {
    expect(() => getTableName('DEFINITELY_NOT_SET')).toThrow('DEFINITELY_NOT_SET');
  });
});
