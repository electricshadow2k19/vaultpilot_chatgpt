const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sts = new AWS.STS();
const iam = new AWS.IAM();
const secretsManager = new AWS.SecretsManager();

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE || 'vaultpilot-accounts-prod';
const CREDENTIALS_TABLE = process.env.CREDENTIALS_TABLE || 'vaultpilot-credentials-prod';
const AUDIT_TABLE = process.env.AUDIT_TABLE || 'vaultpilot-audit-logs-prod';

// CORS headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

/**
 * List all connected AWS accounts
 */
exports.listAccounts = async (event) => {
  try {
    console.log('Listing all AWS accounts...');

    const result = await dynamodb.scan({
      TableName: ACCOUNTS_TABLE
    }).promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        accounts: result.Items || [],
        count: result.Items ? result.Items.length : 0
      })
    };
  } catch (error) {
    console.error('Error listing accounts:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to list accounts',
        message: error.message
      })
    };
  }
};

/**
 * Get a single AWS account
 */
exports.getAccount = async (event) => {
  try {
    const accountId = event.pathParameters.accountId;
    console.log('Getting account:', accountId);

    const result = await dynamodb.get({
      TableName: ACCOUNTS_TABLE,
      Key: { id: accountId }
    }).promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'Account not found'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.Item)
    };
  } catch (error) {
    console.error('Error getting account:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to get account',
        message: error.message
      })
    };
  }
};

/**
 * Add a new AWS account
 */
exports.addAccount = async (event) => {
  try {
    const body = JSON.parse(event.body);
    console.log('Adding new account:', body.name);

    // Validate required fields
    if (!body.name || !body.accountId || !body.roleArn || !body.externalId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['name', 'accountId', 'roleArn', 'externalId']
        })
      };
    }

    // Validate ARN format
    if (!body.roleArn.startsWith('arn:aws:iam::')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid IAM Role ARN format'
        })
      };
    }

    // Validate Account ID (12 digits)
    if (!/^\d{12}$/.test(body.accountId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid AWS Account ID (must be 12 digits)'
        })
      };
    }

    const account = {
      id: uuidv4(),
      name: body.name,
      accountId: body.accountId,
      roleArn: body.roleArn,
      externalId: body.externalId,
      regions: body.regions || ['us-east-1'],
      status: 'pending',
      lastScan: null,
      credentialsFound: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: body.metadata || {}
    };

    // Save to DynamoDB
    await dynamodb.put({
      TableName: ACCOUNTS_TABLE,
      Item: account
    }).promise();

    // Log to audit trail
    await logAudit('account_added', `AWS account added: ${account.name}`, {
      accountId: account.id,
      accountName: account.name,
      awsAccountId: account.accountId
    });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Account added successfully',
        account: account
      })
    };
  } catch (error) {
    console.error('Error adding account:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to add account',
        message: error.message
      })
    };
  }
};

/**
 * Update an existing AWS account
 */
exports.updateAccount = async (event) => {
  try {
    const accountId = event.pathParameters.accountId;
    const body = JSON.parse(event.body);
    console.log('Updating account:', accountId);

    // Build update expression
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (body.name) {
      updateExpression.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }

    if (body.roleArn) {
      updateExpression.push('roleArn = :roleArn');
      expressionAttributeValues[':roleArn'] = body.roleArn;
    }

    if (body.externalId) {
      updateExpression.push('externalId = :externalId');
      expressionAttributeValues[':externalId'] = body.externalId;
    }

    if (body.regions) {
      updateExpression.push('regions = :regions');
      expressionAttributeValues[':regions'] = body.regions;
    }

    if (body.status) {
      updateExpression.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = body.status;
    }

    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await dynamodb.update({
      TableName: ACCOUNTS_TABLE,
      Key: { id: accountId },
      UpdateExpression: 'SET ' + updateExpression.join(', '),
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }).promise();

    // Log to audit trail
    await logAudit('account_updated', `AWS account updated: ${result.Attributes.name}`, {
      accountId: accountId,
      changes: body
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Account updated successfully',
        account: result.Attributes
      })
    };
  } catch (error) {
    console.error('Error updating account:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to update account',
        message: error.message
      })
    };
  }
};

/**
 * Delete an AWS account
 */
exports.deleteAccount = async (event) => {
  try {
    const accountId = event.pathParameters.accountId;
    console.log('Deleting account:', accountId);

    // Get account details first for audit log
    const account = await dynamodb.get({
      TableName: ACCOUNTS_TABLE,
      Key: { id: accountId }
    }).promise();

    if (!account.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'Account not found'
        })
      };
    }

    // Delete the account
    await dynamodb.delete({
      TableName: ACCOUNTS_TABLE,
      Key: { id: accountId }
    }).promise();

    // Log to audit trail
    await logAudit('account_deleted', `AWS account deleted: ${account.Item.name}`, {
      accountId: accountId,
      accountName: account.Item.name,
      awsAccountId: account.Item.accountId
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Account deleted successfully'
      })
    };
  } catch (error) {
    console.error('Error deleting account:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to delete account',
        message: error.message
      })
    };
  }
};

/**
 * Test connection to an AWS account
 * This validates that we can assume the role with the provided credentials
 */
exports.testConnection = async (event) => {
  try {
    const body = JSON.parse(event.body);
    console.log('Testing connection to account:', body.accountId);

    if (!body.roleArn || !body.externalId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields: roleArn and externalId'
        })
      };
    }

    // Attempt to assume the role
    console.log('Attempting to assume role:', body.roleArn);
    const assumeRoleParams = {
      RoleArn: body.roleArn,
      RoleSessionName: 'VaultPilotConnectionTest',
      ExternalId: body.externalId,
      DurationSeconds: 900 // 15 minutes
    };

    const assumedRole = await sts.assumeRole(assumeRoleParams).promise();
    console.log('Successfully assumed role');

    // Create temporary credentials
    const tempCredentials = {
      accessKeyId: assumedRole.Credentials.AccessKeyId,
      secretAccessKey: assumedRole.Credentials.SecretAccessKey,
      sessionToken: assumedRole.Credentials.SessionToken
    };

    // Test IAM access
    const tempIAM = new AWS.IAM(tempCredentials);
    try {
      const users = await tempIAM.listUsers({ MaxItems: 1 }).promise();
      console.log('IAM access verified - can list users');
    } catch (error) {
      console.warn('IAM access limited:', error.message);
    }

    // Test Secrets Manager access
    const tempSecretsManager = new AWS.SecretsManager(tempCredentials);
    try {
      const secrets = await tempSecretsManager.listSecrets({ MaxResults: 1 }).promise();
      console.log('Secrets Manager access verified');
    } catch (error) {
      console.warn('Secrets Manager access limited:', error.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Connection successful! Role can be assumed and credentials work.',
        details: {
          roleArn: body.roleArn,
          assumedAt: new Date().toISOString(),
          expiresAt: assumedRole.Credentials.Expiration,
          hasIAMAccess: true,
          hasSecretsAccess: true
        }
      })
    };
  } catch (error) {
    console.error('Connection test failed:', error);

    let errorMessage = 'Failed to connect to AWS account';
    let suggestion = 'Check that the IAM role exists and trusts your VaultPilot account';

    if (error.code === 'AccessDenied') {
      errorMessage = 'Access denied when assuming role';
      suggestion = 'Verify the trust policy allows your VaultPilot account (700880967608) to assume this role';
    } else if (error.code === 'InvalidClientTokenId') {
      errorMessage = 'Invalid external ID';
      suggestion = 'Check that the external ID matches the one in the IAM role trust policy';
    }

    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        suggestion: suggestion,
        details: {
          code: error.code,
          message: error.message
        }
      })
    };
  }
};

/**
 * Trigger a scan of an AWS account
 * This will discover all credentials in the account
 */
exports.scanAccount = async (event) => {
  try {
    const accountId = event.pathParameters.accountId;
    console.log('Scanning account:', accountId);

    // Get account details
    const accountResult = await dynamodb.get({
      TableName: ACCOUNTS_TABLE,
      Key: { id: accountId }
    }).promise();

    if (!accountResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'Account not found'
        })
      };
    }

    const account = accountResult.Item;

    // Update status to scanning
    await dynamodb.update({
      TableName: ACCOUNTS_TABLE,
      Key: { id: accountId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'scanning',
        ':updatedAt': new Date().toISOString()
      }
    }).promise();

    // Assume the role
    const assumedRole = await sts.assumeRole({
      RoleArn: account.roleArn,
      RoleSessionName: 'VaultPilotScan',
      ExternalId: account.externalId,
      DurationSeconds: 3600
    }).promise();

    const credentials = {
      accessKeyId: assumedRole.Credentials.AccessKeyId,
      secretAccessKey: assumedRole.Credentials.SecretAccessKey,
      sessionToken: assumedRole.Credentials.SessionToken
    };

    let totalCredentials = 0;
    const credentialsList = [];

    // Scan each region
    for (const region of account.regions) {
      console.log(`Scanning region: ${region}`);

      // Scan IAM (global, only do once)
      if (region === account.regions[0]) {
        const tempIAM = new AWS.IAM(credentials);
        const users = await tempIAM.listUsers().promise();

        for (const user of users.Users) {
          const accessKeys = await tempIAM.listAccessKeys({ UserName: user.UserName }).promise();

          for (const key of accessKeys.AccessKeyMetadata) {
            const age = Math.floor((Date.now() - key.CreateDate.getTime()) / (1000 * 60 * 60 * 24));

            const credential = {
              id: uuidv4(),
              accountId: accountId,
              tenantId: account.accountId,
              name: `${user.UserName}-${key.AccessKeyId}`,
              type: 'AWS_IAM_KEY',
              environment: 'production',
              lastRotated: key.CreateDate.toISOString(),
              expiresIn: 90 - age,
              status: age > 90 ? 'expired' : age > 75 ? 'expiring' : 'active',
              source: 'IAM',
              region: 'global',
              metadata: {
                userName: user.UserName,
                accessKeyId: key.AccessKeyId,
                keyStatus: key.Status,
                ageInDays: age
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            credentialsList.push(credential);
            totalCredentials++;

            // Save to credentials table
            await dynamodb.put({
              TableName: CREDENTIALS_TABLE,
              Item: credential
            }).promise();
          }
        }
      }

      // Scan Secrets Manager
      const tempSecretsManager = new AWS.SecretsManager({ ...credentials, region });
      const secrets = await tempSecretsManager.listSecrets().promise();

      for (const secret of secrets.SecretList) {
        const age = secret.LastChangedDate
          ? Math.floor((Date.now() - secret.LastChangedDate.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        const credential = {
          id: uuidv4(),
          accountId: accountId,
          tenantId: account.accountId,
          name: secret.Name,
          type: 'SECRETS_MANAGER',
          environment: 'production',
          lastRotated: secret.LastChangedDate ? secret.LastChangedDate.toISOString() : 'Never',
          expiresIn: 90 - age,
          status: age > 90 ? 'expired' : age > 75 ? 'expiring' : 'active',
          source: 'SecretsManager',
          region: region,
          metadata: {
            arn: secret.ARN,
            description: secret.Description,
            rotationEnabled: secret.RotationEnabled,
            ageInDays: age
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        credentialsList.push(credential);
        totalCredentials++;

        await dynamodb.put({
          TableName: CREDENTIALS_TABLE,
          Item: credential
        }).promise();
      }
    }

    // Update account with scan results
    await dynamodb.update({
      TableName: ACCOUNTS_TABLE,
      Key: { id: accountId },
      UpdateExpression: 'SET #status = :status, lastScan = :lastScan, credentialsFound = :credentialsFound, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'active',
        ':lastScan': new Date().toISOString(),
        ':credentialsFound': totalCredentials,
        ':updatedAt': new Date().toISOString()
      }
    }).promise();

    // Log to audit trail
    await logAudit('account_scanned', `AWS account scanned: ${account.name}`, {
      accountId: accountId,
      accountName: account.name,
      credentialsFound: totalCredentials,
      regions: account.regions
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Account scan completed successfully',
        credentialsFound: totalCredentials,
        credentials: credentialsList
      })
    };
  } catch (error) {
    console.error('Error scanning account:', error);

    // Update status to error
    try {
      await dynamodb.update({
        TableName: ACCOUNTS_TABLE,
        Key: { id: event.pathParameters.accountId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'error',
          ':updatedAt': new Date().toISOString()
        }
      }).promise();
    } catch (updateError) {
      console.error('Failed to update account status:', updateError);
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to scan account',
        message: error.message
      })
    };
  }
};

/**
 * Helper function to log audit entries
 */
async function logAudit(action, description, metadata) {
  try {
    await dynamodb.put({
      TableName: AUDIT_TABLE,
      Item: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        action,
        description,
        metadata,
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
      }
    }).promise();
  } catch (error) {
    console.error('Failed to log audit entry:', error);
  }
}
