import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { FeightlyBackendStack } from '../lib/feightly-backend-stack';

// Synthesises the real stack offline (no AWS credentials needed) and checks the key infrastructure.
let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new FeightlyBackendStack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  template = Template.fromStack(stack);
});

describe('FeightlyBackendStack', () => {
  it('creates the five on-demand DynamoDB tables', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 5);
    for (const name of ['Feightly-Loads', 'Feightly-Drivers', 'Feightly-Negotiations', 'Feightly-Documents', 'Feightly-Bookings']) {
      template.hasResourceProperties('AWS::DynamoDB::Table', { TableName: name, BillingMode: 'PAY_PER_REQUEST' });
    }
  });

  it('keeps the documents bucket private and encrypted', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: Match.objectLike({}),
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
  });

  it('wires the search, booking and negotiation Lambdas', () => {
    for (const handler of ['corridor-search.handler', 'book-load.handler', 'negotiate.handler', 'broker-response.handler', 'copilot.handler']) {
      template.hasResourceProperties('AWS::Lambda::Function', { Handler: handler });
    }
  });

  it('only lets Lambdas invoke the specific Bedrock model', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            Resource: Match.stringLikeRegexp('foundation-model/anthropic\\.claude-3-haiku'),
          }),
        ]),
      },
    });
  });

  it('exposes a throttled REST API on the prod stage', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: 'prod',
      MethodSettings: Match.arrayWith([Match.objectLike({ ThrottlingRateLimit: 100, ThrottlingBurstLimit: 200 })]),
    });
  });
});
