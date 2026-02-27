import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB, SecretsManager, SSM, IAM } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const dynamodb = new DynamoDB.DocumentClient();
const secretsManager = new SecretsManager();
const ssm = new SSM();
const iam = new IAM();

interface Credential {
  id: string;
  name: string;
  type: string;
  environment: string;
  lastRotated: string;
  expiresIn: number;
  status: 'active' | 'expired' | 'expiring' | 'rotating';
  description?: string;
  source: string;
  metadata: Record<string, any>;
}

export const discovery = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Starting credential discovery process...');
    
    const discoveredCredentials = await discoverCredentials();
    
    // Store discovered credentials in DynamoDB
    await storeCredentials(discoveredCredentials);
    
    // Log discovery activity
    await logActivity('discovery', 'Credential discovery completed', {
      credentialsFound: discoveredCredentials.length,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        message: 'Discovery completed successfully',
        credentialsFound: discoveredCredentials.length,
        credentials: discoveredCredentials
      })
    };
  } catch (error) {
    console.error('Discovery error:', error);
    
    await logActivity('discovery', 'Credential discovery failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Discovery failed',
        message: error.message
      })
    };
  }
};

async function discoverCredentials(): Promise<Credential[]> {
  const credentials: Credential[] = [];
  
  try {
    // Discover AWS IAM Access Keys
    const iamCredentials = await discoverIAMCredentials();
    credentials.push(...iamCredentials);
    
    // Discover Secrets Manager secrets
    const secretsManagerCredentials = await discoverSecretsManagerCredentials();
    credentials.push(...secretsManagerCredentials);
    
    // Discover SSM Parameters
    const ssmCredentials = await discoverSSMCredentials();
    credentials.push(...ssmCredentials);
    
    console.log(`Discovered ${credentials.length} credentials`);
    return credentials;
  } catch (error) {
    console.error('Error discovering credentials:', error);
    throw error;
  }
}

async function discoverIAMCredentials(): Promise<Credential[]> {
  const credentials: Credential[] = [];
  
  try {
    const users = await iam.listUsers().promise();
    
    for (const user of users.Users || []) {
      try {
        const accessKeys = await iam.listAccessKeys({ UserName: user.UserName }).promise();
        
        for (const accessKey of accessKeys.AccessKeyMetadata || []) {
          const lastUsed = await iam.getAccessKeyLastUsed({ AccessKeyId: accessKey.AccessKeyId }).promise();
          const lastUsedDate = lastUsed.AccessKeyLastUsed?.LastUsedDate;
          const daysSinceLastUsed = lastUsedDate ? 
            Math.floor((Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
          
          credentials.push({
            id: uuidv4(),
            name: `AWS Access Key - ${user.UserName}`,
            type: 'AWS IAM',
            environment: 'Production',
            lastRotated: accessKey.CreateDate.toISOString().split('T')[0],
            expiresIn: 90 - daysSinceLastUsed,
            status: daysSinceLastUsed > 60 ? 'expiring' : 'active',
            description: `Access key for user ${user.UserName}`,
            source: 'IAM',
            metadata: {
              userName: user.UserName,
              accessKeyId: accessKey.AccessKeyId,
              status: accessKey.Status,
              lastUsed: lastUsedDate?.toISOString()
            }
          });
        }
      } catch (error) {
        console.error(`Error processing user ${user.UserName}:`, error);
      }
    }
  } catch (error) {
    console.error('Error discovering IAM credentials:', error);
  }
  
  return credentials;
}

async function discoverSecretsManagerCredentials(): Promise<Credential[]> {
  const credentials: Credential[] = [];
  
  try {
    const secrets = await secretsManager.listSecrets().promise();
    
    for (const secret of secrets.SecretList || []) {
      try {
        const secretValue = await secretsManager.getSecretValue({ SecretId: secret.ARN }).promise();
        const secretData = JSON.parse(secretValue.SecretString || '{}');
        
        // Determine credential type based on secret name/content
        let credentialType = 'API Token';
        if (secret.Name?.toLowerCase().includes('database')) credentialType = 'Database';
        if (secret.Name?.toLowerCase().includes('smtp')) credentialType = 'SMTP';
        if (secret.Name?.toLowerCase().includes('github')) credentialType = 'GitHub';
        
        credentials.push({
          id: uuidv4(),
          name: secret.Name || 'Unknown Secret',
          type: credentialType,
          environment: 'Production',
          lastRotated: secret.LastChangedDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
          expiresIn: 90,
          status: 'active',
          description: secret.Description,
          source: 'Secrets Manager',
          metadata: {
            arn: secret.ARN,
            lastChanged: secret.LastChangedDate?.toISOString(),
            hasPassword: !!secretData.password,
            hasUsername: !!secretData.username
          }
        });
      } catch (error) {
        console.error(`Error processing secret ${secret.ARN}:`, error);
      }
    }
  } catch (error) {
    console.error('Error discovering Secrets Manager credentials:', error);
  }
  
  return credentials;
}

async function discoverSSMCredentials(): Promise<Credential[]> {
  const credentials: Credential[] = [];
  
  try {
    const parameters = await ssm.describeParameters().promise();
    
    for (const parameter of parameters.Parameters || []) {
      if (parameter.Name?.includes('password') || parameter.Name?.includes('token') || parameter.Name?.includes('key')) {
        try {
          const parameterValue = await ssm.getParameter({ 
            Name: parameter.Name, 
            WithDecryption: true 
          }).promise();
          
          let credentialType = 'API Token';
          if (parameter.Name?.toLowerCase().includes('database')) credentialType = 'Database';
          if (parameter.Name?.toLowerCase().includes('smtp')) credentialType = 'SMTP';
          if (parameter.Name?.toLowerCase().includes('github')) credentialType = 'GitHub';
          
          credentials.push({
            id: uuidv4(),
            name: parameter.Name,
            type: credentialType,
            environment: 'Production',
            lastRotated: parameter.LastModifiedDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
            expiresIn: 90,
            status: 'active',
            description: parameter.Description,
            source: 'SSM Parameter Store',
            metadata: {
              parameterName: parameter.Name,
              lastModified: parameter.LastModifiedDate?.toISOString(),
              type: parameter.Type,
              tier: parameter.Tier
            }
          });
        } catch (error) {
          console.error(`Error processing parameter ${parameter.Name}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error discovering SSM credentials:', error);
  }
  
  return credentials;
}

async function storeCredentials(credentials: Credential[]): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE environment variable not set');
  }
  
  for (const credential of credentials) {
    try {
      await dynamodb.put({
        TableName: tableName,
        Item: {
          ...credential,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }).promise();
    } catch (error) {
      console.error(`Error storing credential ${credential.id}:`, error);
    }
  }
}

async function logActivity(action: string, description: string, metadata: Record<string, any>): Promise<void> {
  // Use dedicated audit logs table
  const tableName = process.env.AUDIT_TABLE || 'vaultpilot-audit-logs-dev';
  
  try {
    await dynamodb.put({
      TableName: tableName,
      Item: {
        id: uuidv4(),
        type: 'audit_log',
        action,
        description,
        metadata,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }
    }).promise();
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}
