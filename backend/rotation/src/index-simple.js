// Simple working rotation Lambda for testing
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, ListSecretsCommand, PutSecretValueCommand, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { IAMClient, ListUsersCommand, ListAccessKeysCommand, CreateAccessKeyCommand, DeleteAccessKeyCommand, UpdateAccessKeyCommand } = require('@aws-sdk/client-iam');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { randomUUID } = require('crypto');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);
const secretsManager = new SecretsManagerClient({ region: 'us-east-1' });
const iam = new IAMClient({ region: 'us-east-1' });
const sns = new SNSClient({ region: 'us-east-1' });

const CREDENTIALS_TABLE = process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-prod';
const AUDIT_TABLE = process.env.AUDIT_TABLE || 'vaultpilot-audit-logs-prod';
const SNS_TOPIC = process.env.SNS_TOPIC_ARN || 'arn:aws:sns:us-east-1:700880967608:vaultpilot-notifications-prod';

exports.rotation = async (event) => {
  console.log('🔄 Starting credential rotation...');
  
  try {
    // Get credentials that need rotation
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: CREDENTIALS_TABLE,
      FilterExpression: 'expiresIn < :threshold AND #status IN (:expiring, :expired)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':threshold': 15,
        ':expiring': 'expiring',
        ':expired': 'expired'
      }
    }));
    
    const credentialsToRotate = scanResult.Items || [];
    console.log(`Found ${credentialsToRotate.length} credentials to rotate`);
    
    const results = [];
    
    for (const credential of credentialsToRotate) {
      try {
        console.log(`Rotating: ${credential.name} (${credential.type})`);
        
        if (credential.type === 'SECRETS_MANAGER' || credential.type === 'SMTP_PASSWORD' || credential.type === 'RDS_PASSWORD') {
          // Rotate Secrets Manager secret
          const newPassword = generateSecurePassword(32);
          
          await secretsManager.send(new PutSecretValueCommand({
            SecretId: credential.name,
            SecretString: newPassword
          }));
          
          console.log(`✅ Rotated secret: ${credential.name}`);
          
          // Update DynamoDB
          await dynamodb.send(new UpdateCommand({
            TableName: CREDENTIALS_TABLE,
            Key: { id: credential.id },
            UpdateExpression: 'SET #status = :status, lastRotated = :lastRotated, expiresIn = :expiresIn, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': 'active',
              ':lastRotated': new Date().toISOString(),
              ':expiresIn': 90,
              ':updatedAt': new Date().toISOString()
            }
          }));
          
          // Log to audit
          await logAudit('rotation', `Credential rotated: ${credential.name}`, {
            credentialId: credential.id,
            credentialType: credential.type,
            status: 'success'
          });
          
          // Send notification
          await sns.send(new PublishCommand({
            TopicArn: SNS_TOPIC,
            Subject: `✅ VaultPilot: Credential Rotated`,
            Message: `Credential "${credential.name}" (${credential.type}) was successfully rotated.\n\nRotated At: ${new Date().toISOString()}\nNext Rotation: ${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()}`
          }));
          
          results.push({ credential: credential.name, status: 'success' });
          
        } else if (credential.type === 'AWS_IAM_KEY') {
          // Rotate IAM access key
          console.log(`Rotating IAM key: ${credential.metadata.userName}`);
          
          const newKey = await iam.send(new CreateAccessKeyCommand({
            UserName: credential.metadata.userName
          }));
          
          // Deactivate old key
          await iam.send(new UpdateAccessKeyCommand({
            UserName: credential.metadata.userName,
            AccessKeyId: credential.metadata.accessKeyId,
            Status: 'Inactive'
          }));
          
          // Wait a bit
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Delete old key
          await iam.send(new DeleteAccessKeyCommand({
            UserName: credential.metadata.userName,
            AccessKeyId: credential.metadata.accessKeyId
          }));
          
          console.log(`✅ Rotated IAM key for: ${credential.metadata.userName}`);
          
          // Store new key in Secrets Manager
          await secretsManager.send(new PutSecretValueCommand({
            SecretId: `vaultpilot/${credential.metadata.userName}/access-key`,
            SecretString: JSON.stringify({
              AccessKeyId: newKey.AccessKey.AccessKeyId,
              SecretAccessKey: newKey.AccessKey.SecretAccessKey,
              RotatedAt: new Date().toISOString()
            })
          })).catch(async (err) => {
            if (err.name === 'ResourceNotFoundException') {
              // Create if doesn't exist
              const { CreateSecretCommand } = require('@aws-sdk/client-secrets-manager');
              await secretsManager.send(new CreateSecretCommand({
                Name: `vaultpilot/${credential.metadata.userName}/access-key`,
                SecretString: JSON.stringify({
                  AccessKeyId: newKey.AccessKey.AccessKeyId,
                  SecretAccessKey: newKey.AccessKey.SecretAccessKey,
                  RotatedAt: new Date().toISOString()
                })
              }));
            } else {
              throw err;
            }
          });
          
          // Update DynamoDB
          await dynamodb.send(new UpdateCommand({
            TableName: CREDENTIALS_TABLE,
            Key: { id: credential.id },
            UpdateExpression: 'SET #status = :status, lastRotated = :lastRotated, expiresIn = :expiresIn, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': 'active',
              ':lastRotated': new Date().toISOString(),
              ':expiresIn': 90,
              ':updatedAt': new Date().toISOString()
            }
          }));
          
          await logAudit('rotation', `IAM key rotated: ${credential.metadata.userName}`, {
            credentialId: credential.id,
            userName: credential.metadata.userName,
            oldKeyId: credential.metadata.accessKeyId,
            newKeyId: newKey.AccessKey.AccessKeyId
          });
          
          await sns.send(new PublishCommand({
            TopicArn: SNS_TOPIC,
            Subject: `✅ VaultPilot: IAM Key Rotated`,
            Message: `IAM Access Key rotated for user: ${credential.metadata.userName}\n\nNew key stored in Secrets Manager: vaultpilot/${credential.metadata.userName}/access-key`
          }));
          
          results.push({ credential: credential.name, status: 'success', type: 'IAM_KEY' });
        }
        
      } catch (error) {
        console.error(`❌ Failed to rotate ${credential.name}:`, error);
        await logAudit('rotation', `Rotation failed: ${credential.name}`, {
          credentialId: credential.id,
          error: error.message,
          status: 'failed'
        });
        results.push({ credential: credential.name, status: 'failed', error: error.message });
      }
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Rotation completed',
        credentialsRotated: results.length,
        results: results
      })
    };
    
  } catch (error) {
    console.error('❌ Rotation error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Rotation failed',
        message: error.message
      })
    };
  }
};

async function logAudit(action, description, metadata) {
  try {
    await dynamodb.send(new PutCommand({
      TableName: AUDIT_TABLE,
      Item: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        action,
        description,
        metadata,
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
      }
    }));
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
}

function generateSecurePassword(length = 32) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
  const crypto = require('crypto');
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  
  return password;
}
