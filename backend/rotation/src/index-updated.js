// Updated rotation Lambda with AWS SDK v3 and DynamoDB timestamp fix
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } = require('@aws-sdk/client-secrets-manager');
const { RDSClient, ModifyDBInstanceCommand } = require('@aws-sdk/client-rds');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);
const secretsManager = new SecretsManagerClient({ region: 'us-east-1' });
const rds = new RDSClient({ region: 'us-east-1' });

// Generate secure random password
function generateSecurePassword(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[]';
  let password = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

exports.handler = async (event) => {
  console.log('🔄 Rotation Lambda triggered:', JSON.stringify(event, null, 2));
  
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
  
  try {
    // Get all credentials from DynamoDB
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: 'vaultpilot-credentials-prod'
    }));
    
    const credentials = scanResult.Items || [];
    console.log(`Found ${credentials.length} credentials to check for rotation`);
    
    const rotationResults = [];
    
    for (const credential of credentials) {
      console.log(`\n🔍 Processing credential: ${credential.name} (${credential.type})`);
      
      try {
        let rotated = false;
        const now = new Date().toISOString();
        
        // Rotate based on type
        if (credential.type === 'SMTP_PASSWORD' || credential.type === 'RDS_PASSWORD') {
          console.log(`  Rotating secret in Secrets Manager: ${credential.name}`);
          
          // Generate new password
          const newPassword = generateSecurePassword();
          
          // Update in Secrets Manager
          await secretsManager.send(new UpdateSecretCommand({
            SecretId: credential.name,
            SecretString: newPassword
          }));
          
          console.log(`  ✅ Secret rotated in Secrets Manager`);
          rotated = true;
        }
        
        if (rotated) {
          // Update DynamoDB with new timestamp
          console.log(`  📝 Updating DynamoDB with new timestamp: ${now}`);
          
          await dynamodb.send(new UpdateCommand({
            TableName: 'vaultpilot-credentials-prod',
            Key: { id: credential.id },
            UpdateExpression: 'SET lastRotated = :lastRotated, updatedAt = :updatedAt, #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':lastRotated': now,
              ':updatedAt': now,
              ':status': 'active'
            }
          }));
          
          console.log(`  ✅ DynamoDB updated successfully`);
          
          // Try to log to audit table (non-critical)
          try {
            await dynamodb.send(new PutCommand({
              TableName: 'vaultpilot-audit-logs-dev',
              Item: {
                id: `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                action: 'rotation',
                credentialId: credential.id,
                credentialName: credential.name,
                timestamp: now,
                tenantId: credential.tenantId || 'default',
                details: JSON.stringify({
                  type: credential.type,
                  status: 'success',
                  rotatedAt: now
                })
              }
            }));
            console.log(`  ✅ Audit log created`);
          } catch (auditError) {
            console.warn(`  ⚠️  Could not create audit log:`, auditError.message);
          }
          
          rotationResults.push({
            credentialId: credential.id,
            credentialName: credential.name,
            status: 'success',
            rotatedAt: now
          });
        } else {
          console.log(`  ⏭️  Skipped (unsupported type or not ready)`);
        }
        
      } catch (error) {
        console.error(`  ❌ Error rotating ${credential.name}:`, error);
        rotationResults.push({
          credentialId: credential.id,
          credentialName: credential.name,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    console.log(`\n✅ Rotation complete. Results:`, rotationResults);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Rotation completed',
        totalCredentials: credentials.length,
        rotated: rotationResults.filter(r => r.status === 'success').length,
        results: rotationResults
      })
    };
    
  } catch (error) {
    console.error('❌ Rotation Lambda error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Rotation failed',
        message: error.message
      })
    };
  }
};

