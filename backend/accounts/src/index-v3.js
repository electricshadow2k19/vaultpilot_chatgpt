// Accounts API with AWS SDK v3
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { IAMClient, ListUsersCommand, ListAccessKeysCommand } = require('@aws-sdk/client-iam');
const { SecretsManagerClient, ListSecretsCommand, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE || 'vaultpilot-accounts-prod';
const CREDENTIALS_TABLE = process.env.CREDENTIALS_TABLE || 'vaultpilot-credentials-prod';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event) => {
  console.log('Accounts API:', event.httpMethod, event.path);
  
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path || event.rawPath || '/accounts';
  const method = event.httpMethod || event.requestContext?.http?.method;

  try {
    // GET /accounts - List all accounts
    if (method === 'GET' && path === '/accounts') {
      return await listAccounts();
    }
    
    // POST /accounts - Add new account
    if (method === 'POST' && path === '/accounts') {
      const body = JSON.parse(event.body);
      return await addAccount(body);
    }
    
    // POST /accounts/{id}/scan - Scan account for credentials
    if (method === 'POST' && path.includes('/scan')) {
      const accountId = path.split('/')[2];
      return await scanAccount(accountId);
    }
    
    // POST /accounts/{id}/test - Test connection
    if (method === 'POST' && path.includes('/test')) {
      const accountId = path.split('/')[2];
      return await testConnection(accountId);
    }
    
    // DELETE /accounts/{id} - Remove account
    if (method === 'DELETE' && path.match(/\/accounts\/[^\/]+$/)) {
      const accountId = path.split('/')[2];
      return await deleteAccount(accountId);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' })
    };
    
  } catch (error) {
    console.error('API Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function listAccounts() {
  const result = await dynamodb.send(new ScanCommand({
    TableName: ACCOUNTS_TABLE
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      accounts: result.Items || [],
      count: result.Items?.length || 0
    })
  };
}

async function addAccount(data) {
  const { accountName, accountId, roleArn, externalId, regions } = data;
  
  const timestamp = new Date().toISOString();
  const account = {
    id: accountId,
    accountName,
    accountId,
    roleArn,
    externalId,
    regions: regions || ['us-east-1'],
    status: 'pending',
    createdAt: timestamp,
    lastScan: null,
    credentialsFound: 0
  };

  await dynamodb.send(new PutCommand({
    TableName: ACCOUNTS_TABLE,
    Item: account
  }));

  // Test connection automatically
  try {
    await testConnectionInternal(accountId, roleArn, externalId);
    
    // If successful, scan for credentials
    await scanAccountInternal(accountId, roleArn, externalId);
  } catch (error) {
    console.error('Error during initial scan:', error);
  }

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({ account, message: 'Account added, scanning...' })
  };
}

async function testConnection(accountId) {
  const account = await getAccount(accountId);
  if (!account) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Account not found' }) };
  }

  await testConnectionInternal(accountId, account.roleArn, account.externalId);
  
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: 'Connection successful', status: 'active' })
  };
}

async function testConnectionInternal(accountId, roleArn, externalId) {
  const stsClient = new STSClient({ region: 'us-east-1' });
  
  const assumeRoleCommand = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `VaultPilot-${Date.now()}`,
    ExternalId: externalId
  });

  const assumedRole = await stsClient.send(assumeRoleCommand);
  
  // Update status to active
  await dynamodb.send(new UpdateCommand({
    TableName: ACCOUNTS_TABLE,
    Key: { id: accountId },
    UpdateExpression: 'SET #status = :status, lastTested = :timestamp',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'active',
      ':timestamp': new Date().toISOString()
    }
  }));

  return assumedRole;
}

async function scanAccount(accountId) {
  const account = await getAccount(accountId);
  if (!account) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Account not found' }) };
  }

  const result = await scanAccountInternal(accountId, account.roleArn, account.externalId);
  
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(result)
  };
}

async function scanAccountInternal(accountId, roleArn, externalId) {
  console.log(`Scanning account ${accountId} for credentials...`);
  
  // Assume role
  const stsClient = new STSClient({ region: 'us-east-1' });
  const assumedRole = await stsClient.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `VaultPilot-Scan-${Date.now()}`,
    ExternalId: externalId
  }));

  const credentials = {
    accessKeyId: assumedRole.Credentials.AccessKeyId,
    secretAccessKey: assumedRole.Credentials.SecretAccessKey,
    sessionToken: assumedRole.Credentials.SessionToken
  };

  // Create IAM client with assumed role
  const iamClient = new IAMClient({
    region: 'us-east-1',
    credentials
  });

  // Get account details for regions
  const account = await getAccount(accountId);
  const regions = account?.regions || ['us-east-1'];
  
  let totalCredentials = 0;
  const timestamp = new Date().toISOString();

  // Scan IAM (global, only once)
  const usersResult = await iamClient.send(new ListUsersCommand({}));
  const users = usersResult.Users || [];

  // Scan each user's access keys
  for (const user of users) {
    const keysResult = await iamClient.send(new ListAccessKeysCommand({
      UserName: user.UserName
    }));

    for (const key of keysResult.AccessKeyMetadata || []) {
      totalCredentials++;
      
      // Add to credentials table
      await dynamodb.send(new PutCommand({
        TableName: CREDENTIALS_TABLE,
        Item: {
          id: `iam-key-${accountId}-${key.AccessKeyId}`,
          name: `${user.UserName}/${key.AccessKeyId}`,
          type: 'AWS_IAM_KEY',
          tenantId: accountId,
          accountId,
          environment: 'production',
          status: key.Status === 'Active' ? 'active' : 'inactive',
          source: 'IAM',
          lastRotated: key.CreateDate || timestamp,
          createdAt: key.CreateDate || timestamp,
          updatedAt: timestamp,
          expiresIn: 90,
          metadata: {
            userName: user.UserName,
            accessKeyId: key.AccessKeyId
          }
        }
      }));
    }
  }

  // Scan Secrets Manager in each region
  for (const region of regions) {
    try {
      const secretsClient = new SecretsManagerClient({
        region,
        credentials
      });

      const secretsResult = await secretsClient.send(new ListSecretsCommand({}));
      const secrets = secretsResult.SecretList || [];

      for (const secret of secrets) {
        // Determine credential type based on secret name
        let credentialType = 'SECRETS_MANAGER';
        let credentialName = secret.Name;
        
        if (secret.Name?.toLowerCase().includes('database') || secret.Name?.toLowerCase().includes('db') || secret.Name?.toLowerCase().includes('rds')) {
          credentialType = 'RDS_PASSWORD';
        } else if (secret.Name?.toLowerCase().includes('smtp') || secret.Name?.toLowerCase().includes('email')) {
          credentialType = 'SMTP_PASSWORD';
        } else if (secret.Name?.toLowerCase().includes('github')) {
          credentialType = 'GITHUB_TOKEN';
        }

        const age = secret.LastChangedDate 
          ? Math.floor((Date.now() - new Date(secret.LastChangedDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        totalCredentials++;
        
        await dynamodb.send(new PutCommand({
          TableName: CREDENTIALS_TABLE,
          Item: {
            id: `secret-${accountId}-${secret.ARN?.replace(/:/g, '-').replace(/\//g, '-')}`,
            name: credentialName,
            type: credentialType,
            tenantId: accountId,
            accountId,
            environment: 'production',
            status: age > 90 ? 'expired' : age > 75 ? 'expiring' : 'active',
            source: 'SecretsManager',
            lastRotated: secret.LastChangedDate || timestamp,
            createdAt: secret.CreatedDate || timestamp,
            updatedAt: timestamp,
            expiresIn: 90 - age,
            metadata: {
              arn: secret.ARN,
              description: secret.Description,
              rotationEnabled: secret.RotationEnabled || false,
              region: region
            }
          }
        }));
      }
    } catch (error) {
      console.error(`Error scanning Secrets Manager in region ${region}:`, error.message);
    }
  }

  // Update account with scan results
  await dynamodb.send(new UpdateCommand({
    TableName: ACCOUNTS_TABLE,
    Key: { id: accountId },
    UpdateExpression: 'SET credentialsFound = :count, lastScan = :timestamp, #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':count': totalCredentials,
      ':timestamp': timestamp,
      ':status': 'active'
    }
  }));

  return {
    message: `Scan complete. Found ${totalCredentials} credentials (IAM keys + Secrets Manager).`,
    credentialsFound: totalCredentials,
    iamUsers: users.length,
    regionsScanned: regions
  };
}

async function deleteAccount(accountId) {
  await dynamodb.send(new DeleteCommand({
    TableName: ACCOUNTS_TABLE,
    Key: { id: accountId }
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: 'Account deleted' })
  };
}

async function getAccount(accountId) {
  const result = await dynamodb.send(new GetCommand({
    TableName: ACCOUNTS_TABLE,
    Key: { id: accountId }
  }));
  return result.Item;
}

