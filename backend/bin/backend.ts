#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FeightlyBackendStack } from '../lib/feightly-backend-stack';

const app = new cdk.App();
new FeightlyBackendStack(app, 'FeightlyBackendStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'us-east-1' 
  },
});
