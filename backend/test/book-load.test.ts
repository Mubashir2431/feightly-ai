import {
  DynamoDBClient,
  GetItemCommand,
  TransactionCanceledException,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../lambda/book-load';
import { apiEvent, makeLoad, parseResponse } from './helpers/fixtures';

const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);

const ENV = {
  LOADS_TABLE_NAME: 'Loads',
  BOOKINGS_TABLE_NAME: 'Bookings',
  DOCUMENTS_TABLE_NAME: 'Documents',
  DOCUMENTS_BUCKET_NAME: 'docs-bucket',
};

beforeAll(() => Object.assign(process.env, ENV));
afterAll(() => Object.keys(ENV).forEach(k => delete process.env[k]));

beforeEach(() => {
  ddb.reset();
  s3.reset();
  s3.on(PutObjectCommand).resolves({});
  ddb.on(TransactWriteItemsCommand).resolves({});
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

function givenLoad(load: ReturnType<typeof makeLoad> | null) {
  ddb.on(GetItemCommand).resolves(load ? { Item: marshall(load, { removeUndefinedValues: true }) } : {});
}

async function book(loadId: string | undefined, body: unknown) {
  const event = apiEvent({
    pathParameters: loadId ? { loadId } : null,
    body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return parseResponse((await handler(event)) as any);
}

describe('book-load handler: validation', () => {
  it('requires a loadId path parameter', async () => {
    expect((await book(undefined, { driverId: 'D1' })).status).toBe(400);
  });

  it('requires a request body', async () => {
    expect((await book('L1', undefined)).status).toBe(400);
  });

  it('requires driverId', async () => {
    const res = await book('L1', {});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('driverId');
  });

  it('returns 500 for malformed JSON', async () => {
    expect((await book('L1', '{not json')).status).toBe(500);
  });

  it('returns 404 when the load does not exist', async () => {
    givenLoad(null);
    const res = await book('L404', { driverId: 'D1' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOAD_NOT_FOUND');
  });
});

describe('book-load handler: booking', () => {
  it('returns 409 without writing anything when the load is already booked', async () => {
    givenLoad(makeLoad({ loadId: 'L1', status: 'booked' }));

    const res = await book('L1', { driverId: 'D1' });

    expect(res.status).toBe(409);
    expect(ddb.commandCalls(TransactWriteItemsCommand)).toHaveLength(0);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('books an available load in one transaction guarded by a status condition', async () => {
    givenLoad(makeLoad({ loadId: 'L1', postedRate: 2.4, bookNowRate: 2.75, distanceMiles: 800 }));

    const res = await book('L1', { driverId: 'D1' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ loadId: 'L1', finalRate: 2.75, status: 'confirmed' });
    expect(res.body.bookingId).toMatch(/^booking-/);
    expect(res.body.rateConDocId).toMatch(/^doc-/);

    const calls = ddb.commandCalls(TransactWriteItemsCommand);
    expect(calls).toHaveLength(1);
    const items = calls[0].args[0].input.TransactItems!;
    expect(items).toHaveLength(3);

    // 1. Flip the load to booked only if it is still available (prevents double booking).
    const update = items[0].Update!;
    expect(update.TableName).toBe('Loads');
    expect(unmarshall(update.Key!)).toEqual({ loadId: 'L1' });
    expect(update.ConditionExpression).toBe('#status = :available');
    expect(unmarshall(update.ExpressionAttributeValues!)).toEqual({ ':available': 'available', ':booked': 'booked' });

    // 2. Booking record and 3. rate-confirmation document record.
    const booking = unmarshall(items[1].Put!.Item!);
    expect(items[1].Put!.TableName).toBe('Bookings');
    expect(booking).toMatchObject({ bookingId: res.body.bookingId, loadId: 'L1', driverId: 'D1', finalRate: 2.75, status: 'confirmed' });

    const doc = unmarshall(items[2].Put!.Item!);
    expect(items[2].Put!.TableName).toBe('Documents');
    expect(doc).toMatchObject({ docId: res.body.rateConDocId, docType: 'rate_confirmation', s3Key: `rate-confirmations/${res.body.bookingId}.txt` });
  });

  it('uploads a rate confirmation with the agreed rate and total before committing', async () => {
    givenLoad(makeLoad({ loadId: 'L1', bookNowRate: 2.75, distanceMiles: 800 }));

    const res = await book('L1', { driverId: 'D1' });

    const [put] = s3.commandCalls(PutObjectCommand);
    const input = put.args[0].input;
    expect(input.Bucket).toBe('docs-bucket');
    expect(input.Key).toBe(`rate-confirmations/${res.body.bookingId}.txt`);
    expect(input.ContentType).toBe('text/plain');
    expect(input.Body).toContain('RATE CONFIRMATION');
    expect(input.Body).toContain('Rate per Mile: $2.75');
    expect(input.Body).toContain('Total Amount: $2200.00');
    expect(input.Body).toContain('Test Logistics');
  });

  it('falls back to the posted rate when there is no book-now rate', async () => {
    givenLoad(makeLoad({ loadId: 'L1', postedRate: 2.4, bookNowRate: undefined }));
    expect((await book('L1', { driverId: 'D1' })).body.finalRate).toBe(2.4);
  });

  it('returns 409 when another driver wins the race (conditional check fails inside the transaction)', async () => {
    givenLoad(makeLoad({ loadId: 'L1' }));
    ddb.on(TransactWriteItemsCommand).rejects(new TransactionCanceledException({
      message: 'Transaction cancelled',
      $metadata: {},
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }, { Code: 'None' }],
    }));

    const res = await book('L1', { driverId: 'D1' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Load is no longer available');
  });

  it('returns 500 when the transaction is cancelled for another reason', async () => {
    givenLoad(makeLoad({ loadId: 'L1' }));
    ddb.on(TransactWriteItemsCommand).rejects(new TransactionCanceledException({
      message: 'Transaction cancelled', $metadata: {}, CancellationReasons: [{ Code: 'ThrottlingError' }],
    }));
    expect((await book('L1', { driverId: 'D1' })).status).toBe(500);
  });

  it('returns 500 and skips the transaction when the S3 upload fails', async () => {
    givenLoad(makeLoad({ loadId: 'L1' }));
    s3.on(PutObjectCommand).rejects(new Error('S3 down'));

    const res = await book('L1', { driverId: 'D1' });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toContain('rate confirmation');
    expect(ddb.commandCalls(TransactWriteItemsCommand)).toHaveLength(0);
  });

  it('returns 500 when reading the load fails', async () => {
    ddb.on(GetItemCommand).rejects(new Error('DynamoDB down'));
    expect((await book('L1', { driverId: 'D1' })).status).toBe(500);
  });
});
