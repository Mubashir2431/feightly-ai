import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as path from 'path';

export class FeightlyBackendStack extends cdk.Stack {
  public readonly loadsTable: dynamodb.Table;
  public readonly driversTable: dynamodb.Table;
  public readonly negotiationsTable: dynamodb.Table;
  public readonly documentsTable: dynamodb.Table;
  public readonly bookingsTable: dynamodb.Table;
  public readonly documentsBucket: s3.Bucket;
  public readonly lambdaExecutionRole: iam.Role;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    
    // Loads Table
    this.loadsTable = new dynamodb.Table(this, 'LoadsTable', {
      partitionKey: { name: 'loadId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test - change to RETAIN for production
      tableName: 'Feightly-Loads',
    });

    // Drivers Table
    this.driversTable = new dynamodb.Table(this, 'DriversTable', {
      partitionKey: { name: 'driverId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: 'Feightly-Drivers',
    });

    // Negotiations Table
    this.negotiationsTable = new dynamodb.Table(this, 'NegotiationsTable', {
      partitionKey: { name: 'negotiationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: 'Feightly-Negotiations',
    });

    // Documents Table
    this.documentsTable = new dynamodb.Table(this, 'DocumentsTable', {
      partitionKey: { name: 'docId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: 'Feightly-Documents',
    });

    // Bookings Table
    this.bookingsTable = new dynamodb.Table(this, 'BookingsTable', {
      partitionKey: { name: 'bookingId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: 'Feightly-Bookings',
    });

    // S3 Bucket for documents
    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `feightly-documents-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test
      autoDeleteObjects: true, // For dev/test - remove for production
      versioned: false,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'], // Restrict in production
          allowedHeaders: ['*'],
        },
      ],
    });

    // IAM Role for Lambda functions
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'FeightlyLambdaExecutionRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant Lambda role permissions to access DynamoDB tables
    this.loadsTable.grantReadWriteData(this.lambdaExecutionRole);
    this.driversTable.grantReadWriteData(this.lambdaExecutionRole);
    this.negotiationsTable.grantReadWriteData(this.lambdaExecutionRole);
    this.documentsTable.grantReadWriteData(this.lambdaExecutionRole);
    this.bookingsTable.grantReadWriteData(this.lambdaExecutionRole);

    // Grant Lambda role permissions to access S3 bucket
    this.documentsBucket.grantReadWrite(this.lambdaExecutionRole);

    // Grant Lambda role permissions to invoke Bedrock
    this.lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      })
    );

    // API Gateway REST API
    this.api = new apigateway.RestApi(this, 'FeightlyApi', {
      restApiName: 'Feightly API',
      description: 'Feightly.ai Backend REST API',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // TODO: Restrict in production
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Request-Id',
        ],
        allowCredentials: true,
      },
      cloudWatchRole: true,
    });

    // Lambda Functions

    // Load Search Lambda
    const loadSearchLambda = new lambda.Function(this, 'LoadSearchLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'load-search.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        LOADS_TABLE_NAME: this.loadsTable.tableName,
        DRIVERS_TABLE_NAME: this.driversTable.tableName,
      },
      description: 'Search for available loads with filters',
    });

    // Load Detail Lambda
    const loadDetailLambda = new lambda.Function(this, 'LoadDetailLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'load-detail.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        LOADS_TABLE_NAME: this.loadsTable.tableName,
      },
      description: 'Retrieve a single load by ID',
    });

    // Book Load Lambda
    const bookLoadLambda = new lambda.Function(this, 'BookLoadLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'book-load.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        LOADS_TABLE_NAME: this.loadsTable.tableName,
        BOOKINGS_TABLE_NAME: this.bookingsTable.tableName,
        DOCUMENTS_TABLE_NAME: this.documentsTable.tableName,
        DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
      },
      description: 'Book a load and generate rate confirmation',
    });

    // API Gateway Resources and Methods

    // /loads resource
    const loadsResource = this.api.root.addResource('loads');
    
    // GET /loads
    loadsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(loadSearchLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: {
          'method.request.querystring.originCity': false,
          'method.request.querystring.destCity': false,
          'method.request.querystring.equipment': false,
          'method.request.querystring.minRate': false,
          'method.request.querystring.maxDeadhead': false,
          'method.request.querystring.bookingType': false,
          'method.request.querystring.driverId': false,
        },
      }
    );

    // /loads/{loadId} resource
    const loadResource = loadsResource.addResource('{loadId}');
    
    // GET /loads/{loadId}
    loadResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(loadDetailLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: {
          'method.request.path.loadId': true,
        },
      }
    );

    // /loads/{loadId}/book resource
    const bookResource = loadResource.addResource('book');
    
    // POST /loads/{loadId}/book
    bookResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(bookLoadLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: {
          'method.request.path.loadId': true,
        },
      }
    );

    // Negotiate Lambda
    const negotiateLambda = new lambda.Function(this, 'NegotiateLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'negotiate.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(60), // Longer timeout for Bedrock calls
      memorySize: 1024, // More memory for Bedrock calls
      environment: {
        LOADS_TABLE_NAME: this.loadsTable.tableName,
        DRIVERS_TABLE_NAME: this.driversTable.tableName,
        NEGOTIATIONS_TABLE_NAME: this.negotiationsTable.tableName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/send-email',
        N8N_AUTOMATION_SECRET: process.env.N8N_AUTOMATION_SECRET || '',
      },
      description: 'Start autonomous negotiation with broker',
    });

    // Broker Response Lambda
    const brokerResponseLambda = new lambda.Function(this, 'BrokerResponseLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'broker-response.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(60), // Longer timeout for Bedrock calls
      memorySize: 1024, // More memory for Bedrock calls
      environment: {
        LOADS_TABLE_NAME: this.loadsTable.tableName,
        DRIVERS_TABLE_NAME: this.driversTable.tableName,
        NEGOTIATIONS_TABLE_NAME: this.negotiationsTable.tableName,
        BOOKINGS_TABLE_NAME: this.bookingsTable.tableName,
        DOCUMENTS_TABLE_NAME: this.documentsTable.tableName,
        DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/send-email',
        N8N_AUTOMATION_SECRET: process.env.N8N_AUTOMATION_SECRET || '',
      },
      description: 'Handle broker responses in autonomous negotiation',
    });

    // Negotiation Status Lambda
    const negotiationStatusLambda = new lambda.Function(this, 'NegotiationStatusLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'negotiation-status.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NEGOTIATIONS_TABLE_NAME: this.negotiationsTable.tableName,
      },
      description: 'Retrieve negotiation status with all offers',
    });

    // /negotiate resource
    const negotiateResource = this.api.root.addResource('negotiate');
    
    // POST /negotiate
    negotiateResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(negotiateLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // /negotiations resource
    const negotiationsResource = this.api.root.addResource('negotiations');
    
    // /negotiations/{negotiationId} resource
    const negotiationResource = negotiationsResource.addResource('{negotiationId}');
    
    // GET /negotiations/{negotiationId}
    negotiationResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(negotiationStatusLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: {
          'method.request.path.negotiationId': true,
        },
      }
    );
    
    // /negotiations/{negotiationId}/broker-response resource
    const brokerResponseResource = negotiationResource.addResource('broker-response');
    
    // POST /negotiations/{negotiationId}/broker-response
    brokerResponseResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(brokerResponseLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: {
          'method.request.path.negotiationId': true,
        },
      }
    );

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'LoadsTableName', {
      value: this.loadsTable.tableName,
      description: 'Loads DynamoDB Table Name',
      exportName: 'FeightlyLoadsTableName',
    });

    new cdk.CfnOutput(this, 'DriversTableName', {
      value: this.driversTable.tableName,
      description: 'Drivers DynamoDB Table Name',
      exportName: 'FeightlyDriversTableName',
    });

    new cdk.CfnOutput(this, 'NegotiationsTableName', {
      value: this.negotiationsTable.tableName,
      description: 'Negotiations DynamoDB Table Name',
      exportName: 'FeightlyNegotiationsTableName',
    });

    new cdk.CfnOutput(this, 'DocumentsTableName', {
      value: this.documentsTable.tableName,
      description: 'Documents DynamoDB Table Name',
      exportName: 'FeightlyDocumentsTableName',
    });

    new cdk.CfnOutput(this, 'BookingsTableName', {
      value: this.bookingsTable.tableName,
      description: 'Bookings DynamoDB Table Name',
      exportName: 'FeightlyBookingsTableName',
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'Documents S3 Bucket Name',
      exportName: 'FeightlyDocumentsBucketName',
    });

    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: this.lambdaExecutionRole.roleArn,
      description: 'Lambda Execution Role ARN',
      exportName: 'FeightlyLambdaExecutionRoleArn',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: 'FeightlyApiGatewayUrl',
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: 'FeightlyApiGatewayId',
    });

    // Driver Dashboard Lambda
    const driverDashboardLambda = new lambda.Function(this, 'DriverDashboardLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'driver-dashboard.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        BOOKINGS_TABLE_NAME: this.bookingsTable.tableName,
        LOADS_TABLE_NAME: this.loadsTable.tableName,
      },
      description: 'Retrieve driver dashboard metrics',
    });

    // /driver resource
    const driverResource = this.api.root.addResource('driver');
    
    // /driver/{driverId} resource
    const driverIdResource = driverResource.addResource('{driverId}');
    
    // /driver/{driverId}/dashboard resource
    const dashboardResource = driverIdResource.addResource('dashboard');
    
    // GET /driver/{driverId}/dashboard
    dashboardResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(driverDashboardLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: {
          'method.request.path.driverId': true,
        },
      }
    );

    // Driver Documents Lambda
    const driverDocumentsLambda = new lambda.Function(this, 'DriverDocumentsLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'driver-documents.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DOCUMENTS_TABLE_NAME: this.documentsTable.tableName,
        DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
      },
      description: 'Retrieve driver documents with presigned S3 URLs',
    });

    // /driver/{driverId}/documents resource
    const documentsResource = driverIdResource.addResource('documents');
    
    // GET /driver/{driverId}/documents
    documentsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(driverDocumentsLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: {
          'method.request.path.driverId': true,
        },
      }
    );

    // Copilot Lambda - Natural language to structured search
    const copilotLambda = new lambda.Function(this, 'CopilotLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'copilot.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        LOADS_TABLE_NAME: this.loadsTable.tableName,
        DRIVERS_TABLE_NAME: this.driversTable.tableName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
      },
      description: 'Parse natural language input and return structured search parameters',
    });

    // /copilot resource
    const copilotResource = this.api.root.addResource('copilot');
    
    // POST /copilot
    copilotResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(copilotLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // Voice Input Lambda - Transcribe audio with OpenAI Whisper and parse intent
    const voiceInputLambda = new lambda.Function(this, 'VoiceInputLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'voice-input.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024,
      environment: {
        LOADS_TABLE_NAME: this.loadsTable.tableName,
        DRIVERS_TABLE_NAME: this.driversTable.tableName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        OPENAI_WHISPER_MODEL: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
      },
      description: 'Transcribe voice input with OpenAI Whisper and parse driver intent',
    });

    // /voice resource
    const voiceResource = this.api.root.addResource('voice');
    
    // POST /voice
    voiceResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(voiceInputLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );
  }
}

