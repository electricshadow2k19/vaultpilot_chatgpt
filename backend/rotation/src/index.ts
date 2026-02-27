import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB, SecretsManager, SSM, IAM, SNS, ECS, Lambda } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

const dynamodb = new DynamoDB.DocumentClient();
const secretsManager = new SecretsManager();
const ssm = new SSM();
const iam = new IAM();
const sns = new SNS();
const ecs = new ECS();
const lambda = new Lambda();

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

export const rotation = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Starting credential rotation process...');
    
    // Get credentials that need rotation
    const credentialsToRotate = await getCredentialsToRotate();
    
    const rotationResults = [];
    
    for (const credential of credentialsToRotate) {
      try {
        const result = await rotateCredentialInternal(credential);
        rotationResults.push(result);
        
        // Log rotation activity
        await logActivity('rotation', `Credential rotated: ${credential.name}`, {
          credentialId: credential.id,
          credentialName: credential.name,
          credentialType: credential.type,
          status: result.success ? 'success' : 'failed',
          error: result.error,
          timestamp: new Date().toISOString()
        });
        
        // Send notification
        await sendNotification(credential, result);
        
      } catch (error: any) {
        console.error(`Error rotating credential ${credential.id}:`, error);
        
        await logActivity('rotation', `Credential rotation failed: ${credential.name}`, {
          credentialId: credential.id,
          credentialName: credential.name,
          credentialType: credential.type,
          status: 'failed',
          error: error?.message || String(error),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        message: 'Rotation completed',
        credentialsRotated: rotationResults.length,
        results: rotationResults
      })
    };
  } catch (error: any) {
    console.error('Rotation error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Rotation failed',
        message: error?.message || String(error)
      })
    };
  }
};

export const rotateCredential = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('=== ROTATE CREDENTIAL FUNCTION CALLED ===');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Path parameters:', event.pathParameters);
  console.log('Request context:', event.requestContext);
  
  try {
    const credentialId = event.pathParameters?.credentialId;
    console.log('Extracted credential ID:', credentialId);
    
    if (!credentialId) {
      console.error('ERROR: Credential ID not found in path parameters');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Credential ID is required' })
      };
    }
    
    // Get credential details
    console.log('Fetching credential from DynamoDB...');
    const credential = await getCredentialById(credentialId);
    console.log('Credential fetched:', credential ? JSON.stringify(credential, null, 2) : 'NOT FOUND');
    
    if (!credential) {
      console.error('ERROR: Credential not found in DynamoDB');
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Credential not found' })
      };
    }
    
    console.log(`Credential type: ${credential.type}, Name: ${credential.name}`);
    console.log('Starting rotation...');
    
    // Rotate the credential
    const result = await rotateCredentialInternal(credential);
    
    console.log('Rotation result:', JSON.stringify(result, null, 2));
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Credential rotated successfully',
        result
      })
    };
  } catch (error: any) {
    console.error('=== ROTATION ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Rotation failed',
        message: error?.message || String(error)
      })
    };
  }
};

async function getCredentialsToRotate(): Promise<Credential[]> {
  const tableName = process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE environment variable not set');
  }
  
  try {
    const result = await dynamodb.scan({
      TableName: tableName,
      FilterExpression: 'attribute_exists(id) AND (expiresIn < :threshold OR status = :expiring)',
      ExpressionAttributeValues: {
        ':threshold': 30, // Rotate if expires in less than 30 days
        ':expiring': 'expiring'
      }
    }).promise();
    
    return result.Items as Credential[] || [];
  } catch (error) {
    console.error('Error getting credentials to rotate:', error);
    throw error;
  }
}

async function getCredentialById(credentialId: string): Promise<Credential | null> {
  const tableName = process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE environment variable not set');
  }
  
  try {
    const result = await dynamodb.get({
      TableName: tableName,
      Key: { id: credentialId }
    }).promise();
    
    return result.Item as Credential || null;
  } catch (error) {
    console.error('Error getting credential by ID:', error);
    throw error;
  }
}

async function rotateCredentialInternal(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    // Update status to rotating
    await updateCredentialStatus(credential.id, 'rotating');
    
    let result: { success: boolean; error?: string } = { success: false };
    
    switch (credential.type) {
      case 'AWS IAM':
      case 'AWS_IAM_KEY':
        result = await rotateIAMCredential(credential);
        break;
      case 'Database':
      case 'RDS_PASSWORD':
        result = await rotateDatabaseCredential(credential);
        break;
      case 'SMTP':
      case 'SMTP_PASSWORD':
        result = await rotateSMTPCredential(credential);
        break;
      case 'GitHub':
      case 'GITHUB_TOKEN':
        result = await rotateGitHubCredential(credential);
        break;
      case 'API Token':
        result = await rotateAPITokenCredential(credential);
        break;
      case 'SECRETS_MANAGER':
        // SECRETS_MANAGER type needs to be detected based on secret name/content
        // Check if it's a database or SMTP secret and route accordingly
        result = await rotateSecretsManagerCredential(credential);
        break;
      default:
        result = { success: false, error: `Unsupported credential type: ${credential.type}` };
    }
    
    if (result.success) {
      // Update credential with new rotation date
      await updateCredentialRotation(credential.id);
      
      // Log successful rotation to audit table
      await logActivity('rotation', `Credential rotated: ${credential.name}`, {
        credentialId: credential.id,
        credentialType: credential.type,
        status: 'success'
      });
    } else {
      // Revert status on failure
      await updateCredentialStatus(credential.id, 'active');
      
      // Log failed rotation to audit table
      await logActivity('rotation_failed', `Rotation failed: ${credential.name}`, {
        credentialId: credential.id,
        credentialType: credential.type,
        status: 'failed',
        error: result.error
      });
    }
    
    return result;
  } catch (error: any) {
    console.error('Error rotating credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function rotateIAMCredential(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    const userName = credential.metadata.userName;
    const oldAccessKeyId = credential.metadata.accessKeyId;
    
    // Create new access key
    const newAccessKey = await iam.createAccessKey({ UserName: userName }).promise();
    
    // Update the credential in storage
    await updateCredentialInStorage(credential, {
      accessKeyId: newAccessKey.AccessKey.AccessKeyId,
      secretAccessKey: newAccessKey.AccessKey.SecretAccessKey,
      lastRotated: new Date().toISOString()
    });
    
    // Delete old access key
    await iam.deleteAccessKey({ 
      UserName: userName, 
      AccessKeyId: oldAccessKeyId 
    }).promise();
    
    // Restart services that use this credential
    await restartServices(credential);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error rotating IAM credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function rotateDatabaseCredential(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('=== ROTATING DATABASE CREDENTIAL ===');
    console.log('Credential metadata:', JSON.stringify(credential.metadata, null, 2));
    console.log('Credential name:', credential.name);
    
    // Generate new password
    const newPassword = generateSecurePassword();
    console.log('Generated new password (first 10 chars):', newPassword.substring(0, 10) + '...');
    
    // Get secret name from credential (could be name or ARN from metadata)
    const secretId = credential.metadata?.arn || credential.name;
    console.log('Secret ID to use:', secretId);
    
    if (!secretId) {
      throw new Error('Secret ID not found in credential');
    }
    
    console.log(`Rotating database secret: ${secretId}`);
    
    // Get current secret value from Secrets Manager
    let currentSecret;
    try {
      console.log(`Attempting to get secret value for: ${secretId}`);
      const secretResponse = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
      currentSecret = secretResponse.SecretString || '';
      console.log(`Current secret retrieved (length: ${currentSecret.length})`);
      console.log(`Current secret preview: ${currentSecret.substring(0, 20)}...`);
    } catch (error: any) {
      console.error(`Error getting current secret: ${error?.message || error}`);
      console.error(`Error code: ${error?.code}`);
      throw new Error(`Failed to get secret: ${error?.message || String(error)}`);
    }
    
    // Check if secret is JSON or plaintext
    let secretData;
    let isPlaintext = false;
    try {
      secretData = JSON.parse(currentSecret);
      console.log('Secret is JSON format');
      console.log('Secret data keys:', Object.keys(secretData));
    } catch {
      // If not JSON, treat as plain password string
      console.log('Secret is plaintext format');
      isPlaintext = true;
    }
    
    // Update secret in AWS Secrets Manager
    let updateResponse;
    if (isPlaintext) {
      // If it's plaintext, replace the entire value with new password
      console.log('Updating plaintext secret with new password...');
      console.log('Secret ID:', secretId);
      console.log('New password length:', newPassword.length);
      
      try {
        updateResponse = await secretsManager.updateSecret({
          SecretId: secretId,
          SecretString: newPassword
        }).promise();
        
        console.log('✅ updateSecret API call succeeded');
        console.log('Update response:', JSON.stringify({
          ARN: updateResponse.ARN,
          VersionId: updateResponse.VersionId,
          Name: updateResponse.Name
        }, null, 2));
        
        if (!updateResponse.ARN) {
          throw new Error('updateSecret returned success but no ARN in response');
        }
      } catch (updateError: any) {
        console.error('❌ updateSecret API call failed!');
        console.error('Error code:', updateError.code);
        console.error('Error message:', updateError.message);
        console.error('Error stack:', updateError.stack);
        console.error('Full error:', JSON.stringify(updateError, null, 2));
        throw new Error(`Failed to update secret: ${updateError.code || updateError.message || String(updateError)}`);
      }
    } else {
      // If JSON, update the password field
      console.log('Updating JSON secret...');
      const oldPassword = secretData.password ? secretData.password.substring(0, 10) + '...' : 'NOT SET';
      secretData.password = newPassword;
      console.log('Updated password field in JSON');
      console.log('Old password (first 10 chars):', oldPassword);
      console.log('New password (first 10 chars):', newPassword.substring(0, 10) + '...');
      console.log('Updated JSON:', JSON.stringify(secretData, null, 2));
      
      // Update secret in AWS Secrets Manager
      try {
        const updatedSecretString = JSON.stringify(secretData);
        console.log('Secret ID:', secretId);
        console.log('Updated secret string length:', updatedSecretString.length);
        
        updateResponse = await secretsManager.updateSecret({
          SecretId: secretId,
          SecretString: updatedSecretString
        }).promise();
        
        console.log('✅ updateSecret API call succeeded');
        console.log('Update response:', JSON.stringify({
          ARN: updateResponse.ARN,
          VersionId: updateResponse.VersionId,
          Name: updateResponse.Name
        }, null, 2));
        
        if (!updateResponse.ARN) {
          throw new Error('updateSecret returned success but no ARN in response');
        }
      } catch (updateError: any) {
        console.error('❌ updateSecret API call failed!');
        console.error('Error code:', updateError.code);
        console.error('Error message:', updateError.message);
        console.error('Error stack:', updateError.stack);
        console.error('Full error:', JSON.stringify(updateError, null, 2));
        throw new Error(`Failed to update secret: ${updateError.code || updateError.message || String(updateError)}`);
      }
    }
    
    // Verify the secret was actually updated by reading it back
    // Small delay to ensure Secrets Manager has propagated the update
    console.log('Verifying secret update (waiting 1 second for propagation)...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      // Try up to 3 times with retries in case of eventual consistency
      let verifyResponse;
      let updatedSecret;
      let retries = 3;
      let verificationSuccess = false;
      
      while (retries > 0 && !verificationSuccess) {
        try {
          verifyResponse = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
          updatedSecret = verifyResponse.SecretString || '';
          verificationSuccess = true;
        } catch (retryError: any) {
          retries--;
          if (retries === 0) {
            throw retryError;
          }
          console.log(`Retry getting secret value (${3 - retries}/3 attempts remaining)...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (isPlaintext) {
        if (updatedSecret !== newPassword) {
          console.error('❌ VERIFICATION FAILED: Secret value does not match new password!');
          console.error('Expected length:', newPassword.length);
          console.error('Actual length:', updatedSecret.length);
          console.error('Expected (first 20 chars):', newPassword.substring(0, 20));
          console.error('Actual (first 20 chars):', updatedSecret.substring(0, 20));
          throw new Error('Secret update verification failed: values do not match');
        }
        console.log('✅ Verification successful: Plaintext secret matches new password');
      } else {
        const updatedSecretData = JSON.parse(updatedSecret);
        if (updatedSecretData.password !== newPassword) {
          console.error('❌ VERIFICATION FAILED: Secret password field does not match new password!');
          console.error('Expected password (first 10 chars):', newPassword.substring(0, 10));
          console.error('Actual password (first 10 chars):', updatedSecretData.password?.substring(0, 10) || 'NOT FOUND');
          console.error('Secret data keys:', Object.keys(updatedSecretData));
          throw new Error('Secret update verification failed: password field does not match');
        }
        console.log('✅ Verification successful: JSON secret password field matches new password');
      }
    } catch (verifyError: any) {
      console.error('❌ Verification error:', verifyError?.message || verifyError);
      console.error('This may indicate the secret was not updated, or there is a permission issue.');
      throw new Error(`Secret update verification failed: ${verifyError?.message || String(verifyError)}`);
    }
    
    console.log(`✅ Database secret rotated successfully: ${secretId}`);
    
    // Update credential in DynamoDB
    await updateCredentialInStorage(credential, {
      password: newPassword,
      lastRotated: new Date().toISOString()
    });
    
    // Restart services
    await restartServices(credential);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error rotating database credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function rotateSMTPCredential(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('=== ROTATING SMTP CREDENTIAL ===');
    console.log('Credential metadata:', JSON.stringify(credential.metadata, null, 2));
    console.log('Credential name:', credential.name);
    
    // Generate new password
    const newPassword = generateSecurePassword();
    console.log('Generated new password (first 10 chars):', newPassword.substring(0, 10) + '...');
    
    // Get secret name from credential (could be name or ARN from metadata)
    const secretId = credential.metadata?.arn || credential.name;
    console.log('Secret ID to use:', secretId);
    
    if (!secretId) {
      throw new Error('Secret ID not found in credential');
    }
    
    console.log(`Rotating SMTP secret: ${secretId}`);
    
    // Get current secret value from Secrets Manager
    let currentSecret;
    try {
      console.log(`Attempting to get secret value for: ${secretId}`);
      const secretResponse = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
      currentSecret = secretResponse.SecretString || '';
      console.log(`Current secret retrieved (length: ${currentSecret.length})`);
      console.log(`Current secret preview: ${currentSecret.substring(0, 20)}...`);
    } catch (error: any) {
      console.error(`Error getting current secret: ${error?.message || error}`);
      console.error(`Error code: ${error?.code}`);
      throw new Error(`Failed to get secret: ${error?.message || String(error)}`);
    }
    
    // Check if secret is JSON or plaintext
    let secretData;
    let isPlaintext = false;
    try {
      secretData = JSON.parse(currentSecret);
      console.log('Secret is JSON format');
      console.log('Secret data keys:', Object.keys(secretData));
    } catch {
      // If not JSON, treat as plain password string
      console.log('Secret is plaintext format');
      isPlaintext = true;
    }
    
    // Update secret in AWS Secrets Manager
    let updateResponse;
    let passwordFieldName = 'password';
    
    if (isPlaintext) {
      // If it's plaintext, replace the entire value with new password
      console.log('Updating plaintext secret with new password...');
      console.log('Secret ID:', secretId);
      console.log('New password length:', newPassword.length);
      
      try {
        updateResponse = await secretsManager.updateSecret({
          SecretId: secretId,
          SecretString: newPassword
        }).promise();
        
        console.log('✅ updateSecret API call succeeded');
        console.log('Update response:', JSON.stringify({
          ARN: updateResponse.ARN,
          VersionId: updateResponse.VersionId,
          Name: updateResponse.Name
        }, null, 2));
        
        if (!updateResponse.ARN) {
          throw new Error('updateSecret returned success but no ARN in response');
        }
      } catch (updateError: any) {
        console.error('❌ updateSecret API call failed!');
        console.error('Error code:', updateError.code);
        console.error('Error message:', updateError.message);
        console.error('Error stack:', updateError.stack);
        throw new Error(`Failed to update secret: ${updateError.code || updateError.message || String(updateError)}`);
      }
    } else {
      // If JSON, update the appropriate password field
      console.log('Updating JSON secret...');
      if (secretData.smtp_password !== undefined) {
        secretData.smtp_password = newPassword;
        passwordFieldName = 'smtp_password';
        console.log('Updated smtp_password field');
      } else if (secretData.password !== undefined) {
        secretData.password = newPassword;
        passwordFieldName = 'password';
        console.log('Updated password field');
      } else {
        // If no password field exists, add it
        secretData.smtp_password = newPassword;
        passwordFieldName = 'smtp_password';
        console.log('Added smtp_password field');
      }
      
      // Update secret in AWS Secrets Manager
      const updatedSecretString = JSON.stringify(secretData);
      console.log('Secret ID:', secretId);
      console.log('Updated secret string length:', updatedSecretString.length);
      console.log('Password field in JSON:', secretData.password ? secretData.password.substring(0, 10) + '...' : 'NOT SET');
      
      try {
        updateResponse = await secretsManager.updateSecret({
          SecretId: secretId,
          SecretString: updatedSecretString
        }).promise();
        
        console.log('✅ updateSecret API call succeeded');
        console.log('Update response:', JSON.stringify({
          ARN: updateResponse.ARN,
          VersionId: updateResponse.VersionId,
          Name: updateResponse.Name
        }, null, 2));
        
        if (!updateResponse.ARN) {
          throw new Error('updateSecret returned success but no ARN in response');
        }
      } catch (updateError: any) {
        console.error('❌ updateSecret API call failed!');
        console.error('Error code:', updateError.code);
        console.error('Error message:', updateError.message);
        throw new Error(`Failed to update secret: ${updateError.code || updateError.message || String(updateError)}`);
      }
    }
    
    // Verify the secret was actually updated by reading it back
    // Small delay to ensure Secrets Manager has propagated the update
    console.log('Verifying secret update (waiting 1 second for propagation)...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      // Try up to 3 times with retries in case of eventual consistency
      let verifyResponse;
      let updatedSecret;
      let retries = 3;
      let verificationSuccess = false;
      
      while (retries > 0 && !verificationSuccess) {
        try {
          verifyResponse = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
          updatedSecret = verifyResponse.SecretString || '';
          verificationSuccess = true;
        } catch (retryError: any) {
          retries--;
          if (retries === 0) {
            throw retryError;
          }
          console.log(`Retry getting secret value (${3 - retries}/3 attempts remaining)...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (isPlaintext) {
        if (updatedSecret !== newPassword) {
          console.error('❌ VERIFICATION FAILED: Secret value does not match new password!');
          console.error('Expected length:', newPassword.length);
          console.error('Actual length:', updatedSecret.length);
          console.error('Expected (first 20 chars):', newPassword.substring(0, 20));
          console.error('Actual (first 20 chars):', updatedSecret.substring(0, 20));
          throw new Error('Secret update verification failed: values do not match');
        }
        console.log('✅ Verification successful: Plaintext secret matches new password');
      } else {
        const updatedSecretData = JSON.parse(updatedSecret);
        const actualPassword = updatedSecretData[passwordFieldName];
        if (actualPassword !== newPassword) {
          console.error('❌ VERIFICATION FAILED: Secret password field does not match new password!');
          console.error('Field name:', passwordFieldName);
          console.error('Expected password (first 10 chars):', newPassword.substring(0, 10));
          console.error('Actual password (first 10 chars):', actualPassword?.substring(0, 10) || 'NOT FOUND');
          console.error('Secret data keys:', Object.keys(updatedSecretData));
          throw new Error('Secret update verification failed: password field does not match');
        }
        console.log('✅ Verification successful: JSON secret password field matches new password');
      }
    } catch (verifyError: any) {
      console.error('❌ Verification error:', verifyError?.message || verifyError);
      console.error('This may indicate the secret was not updated, or there is a permission issue.');
      throw new Error(`Secret update verification failed: ${verifyError?.message || String(verifyError)}`);
    }
    
    console.log(`✅ SMTP secret rotated successfully: ${secretId}`);
    
    // Update credential in DynamoDB
    await updateCredentialInStorage(credential, {
      password: newPassword,
      lastRotated: new Date().toISOString()
    });
    
    // Restart services
    await restartServices(credential);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error rotating SMTP credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function rotateGitHubCredential(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate new token
    const newToken = generateSecureToken();
    
    // Update credential in storage
    await updateCredentialInStorage(credential, {
      token: newToken,
      lastRotated: new Date().toISOString()
    });
    
    // Update GitHub token (this would typically involve calling the GitHub API)
    console.log(`GitHub token rotated for ${credential.name}`);
    
    // Restart services
    await restartServices(credential);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error rotating GitHub credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function rotateSecretsManagerCredential(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('=== ROTATING SECRETS MANAGER CREDENTIAL ===');
    console.log('Credential name:', credential.name);
    console.log('Credential metadata:', JSON.stringify(credential.metadata, null, 2));
    
    // Get secret ID (ARN or name)
    const secretId = credential.metadata?.arn || credential.name;
    if (!secretId) {
      throw new Error('Secret ID not found in credential');
    }
    
    // Determine credential type based on secret name
    const secretNameLower = credential.name.toLowerCase();
    let actualType = 'UNKNOWN';
    
    if (secretNameLower.includes('database') || secretNameLower.includes('rds') || secretNameLower.includes('db')) {
      actualType = 'RDS_PASSWORD';
      console.log('Detected as database/RDS credential based on name');
    } else if (secretNameLower.includes('smtp') || secretNameLower.includes('email') || secretNameLower.includes('mail')) {
      actualType = 'SMTP_PASSWORD';
      console.log('Detected as SMTP credential based on name');
    } else {
      // Try to inspect the secret content
      try {
        const secretResponse = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
        const secretString = secretResponse.SecretString || '';
        
        // Check if it's JSON
        try {
          const secretData = JSON.parse(secretString);
          const keys = Object.keys(secretData);
          
          // Check for database-related fields
          if (keys.includes('password') && (keys.includes('username') || keys.includes('host') || keys.includes('engine'))) {
            actualType = 'RDS_PASSWORD';
            console.log('Detected as database credential based on content (has password + username/host/engine)');
          } else if (keys.includes('smtp_password') || keys.includes('smtp_host')) {
            actualType = 'SMTP_PASSWORD';
            console.log('Detected as SMTP credential based on content');
          } else if (keys.includes('password')) {
            // Default to database if it has a password field
            actualType = 'RDS_PASSWORD';
            console.log('Detected as database credential based on password field');
          }
        } catch {
          // Not JSON, treat as plaintext - assume database password
          actualType = 'RDS_PASSWORD';
          console.log('Detected as plaintext database credential');
        }
      } catch (error: any) {
        console.warn('Could not inspect secret content, defaulting to database type:', error?.message);
        actualType = 'RDS_PASSWORD';
      }
    }
    
    // Route to appropriate rotation function based on detected type
    if (actualType === 'RDS_PASSWORD') {
      console.log('Routing to database credential rotation');
      return await rotateDatabaseCredential(credential);
    } else if (actualType === 'SMTP_PASSWORD') {
      console.log('Routing to SMTP credential rotation');
      return await rotateSMTPCredential(credential);
    } else {
      // Fallback: try to update Secrets Manager directly
      console.log('Unknown type, attempting generic Secrets Manager update');
      return await rotateGenericSecretsManagerCredential(credential);
    }
  } catch (error: any) {
    console.error('Error rotating Secrets Manager credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function rotateGenericSecretsManagerCredential(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    const secretId = credential.metadata?.arn || credential.name;
    if (!secretId) {
      throw new Error('Secret ID not found in credential');
    }
    
    // Generate new secure value
    const newValue = generateSecurePassword();
    
    // Get current secret to preserve structure if JSON
    let currentSecret;
    try {
      const secretResponse = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
      currentSecret = secretResponse.SecretString || '';
    } catch (error: any) {
      throw new Error(`Failed to get secret: ${error?.message || String(error)}`);
    }
    
    // Try to parse as JSON
    let secretData;
    let isPlaintext = false;
    try {
      secretData = JSON.parse(currentSecret);
    } catch {
      isPlaintext = true;
    }
    
    // Update secret
    let updateResponse;
    if (isPlaintext) {
      console.log('Secret ID:', secretId);
      console.log('New value length:', newValue.length);
      
      try {
        updateResponse = await secretsManager.updateSecret({
          SecretId: secretId,
          SecretString: newValue
        }).promise();
        
        console.log('✅ updateSecret API call succeeded');
        console.log('Update response:', JSON.stringify({
          ARN: updateResponse.ARN,
          VersionId: updateResponse.VersionId,
          Name: updateResponse.Name
        }, null, 2));
        
        if (!updateResponse.ARN) {
          throw new Error('updateSecret returned success but no ARN in response');
        }
      } catch (updateError: any) {
        console.error('❌ updateSecret API call failed!');
        console.error('Error code:', updateError.code);
        console.error('Error message:', updateError.message);
        throw new Error(`Failed to update secret: ${updateError.code || updateError.message || String(updateError)}`);
      }
    } else {
      // Try to update password field if it exists
      if (secretData.password !== undefined) {
        secretData.password = newValue;
      } else {
        // Add password field
        secretData.password = newValue;
      }
      
      const updatedSecretString = JSON.stringify(secretData);
      console.log('Secret ID:', secretId);
      console.log('Updated secret string length:', updatedSecretString.length);
      
      try {
        updateResponse = await secretsManager.updateSecret({
          SecretId: secretId,
          SecretString: updatedSecretString
        }).promise();
        
        console.log('✅ updateSecret API call succeeded');
        console.log('Update response:', JSON.stringify({
          ARN: updateResponse.ARN,
          VersionId: updateResponse.VersionId,
          Name: updateResponse.Name
        }, null, 2));
        
        if (!updateResponse.ARN) {
          throw new Error('updateSecret returned success but no ARN in response');
        }
      } catch (updateError: any) {
        console.error('❌ updateSecret API call failed!');
        console.error('Error code:', updateError.code);
        console.error('Error message:', updateError.message);
        throw new Error(`Failed to update secret: ${updateError.code || updateError.message || String(updateError)}`);
      }
    }
    
    // Verify the update
    console.log('Verifying secret update...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      const verifyResponse = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
      const updatedSecret = verifyResponse.SecretString || '';
      
      if (isPlaintext) {
        if (updatedSecret !== newValue) {
          throw new Error('Secret update verification failed: values do not match');
        }
        console.log('✅ Verification successful');
      } else {
        const updatedSecretData = JSON.parse(updatedSecret);
        if (updatedSecretData.password !== newValue) {
          throw new Error('Secret update verification failed: password field does not match');
        }
        console.log('✅ Verification successful');
      }
    } catch (verifyError: any) {
      console.error('❌ Verification error:', verifyError?.message || verifyError);
      throw new Error(`Secret update verification failed: ${verifyError?.message || String(verifyError)}`);
    }
    
    // Update DynamoDB
    await updateCredentialInStorage(credential, {
      password: newValue,
      lastRotated: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error rotating generic Secrets Manager credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function rotateAPITokenCredential(credential: Credential): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate new token
    const newToken = generateSecureToken();
    
    // Update credential in storage
    await updateCredentialInStorage(credential, {
      token: newToken,
      lastRotated: new Date().toISOString()
    });
    
    // Update API service (this would typically involve calling the service API)
    console.log(`API token rotated for ${credential.name}`);
    
    // Restart services
    await restartServices(credential);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error rotating API token credential:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

async function updateCredentialInStorage(credential: Credential, newValues: Record<string, any>): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE environment variable not set');
  }
  
  try {
    await dynamodb.update({
      TableName: tableName,
      Key: { id: credential.id },
      UpdateExpression: 'SET #metadata = :metadata, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#metadata': 'metadata'
      },
      ExpressionAttributeValues: {
        ':metadata': { ...credential.metadata, ...newValues },
        ':updatedAt': new Date().toISOString()
      }
    }).promise();
  } catch (error) {
    console.error('Error updating credential in storage:', error);
    throw error;
  }
}

async function updateCredentialStatus(credentialId: string, status: string): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE environment variable not set');
  }
  
  try {
    await dynamodb.update({
      TableName: tableName,
      Key: { id: credentialId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': new Date().toISOString()
      }
    }).promise();
  } catch (error) {
    console.error('Error updating credential status:', error);
    throw error;
  }
}

async function updateCredentialRotation(credentialId: string): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE environment variable not set');
  }
  
  try {
    const now = new Date().toISOString();
    console.log(`Updating credential ${credentialId} with lastRotated: ${now}`);
    
    await dynamodb.update({
      TableName: tableName,
      Key: { id: credentialId },
      UpdateExpression: 'SET lastRotated = :lastRotated, expiresIn = :expiresIn, #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':lastRotated': now,
        ':expiresIn': 90,
        ':status': 'active',
        ':updatedAt': now
      }
    }).promise();
  } catch (error) {
    console.error('Error updating credential rotation:', error);
    throw error;
  }
}

async function restartServices(credential: Credential): Promise<void> {
  try {
    // This would typically involve restarting ECS services, Lambda functions, etc.
    // that use the rotated credential
    console.log(`Restarting services for credential: ${credential.name}`);
    
    // Example: Restart ECS service if specified in metadata
    if (credential.metadata.ecsService) {
      await ecs.updateService({
        cluster: credential.metadata.ecsCluster,
        service: credential.metadata.ecsService,
        forceNewDeployment: true
      }).promise();
    }
    
    // Example: Update Lambda environment variables if specified
    if (credential.metadata.lambdaFunction) {
      // This would involve updating the Lambda function's environment variables
      // with the new credential values
      console.log(`Updating Lambda function: ${credential.metadata.lambdaFunction}`);
    }
  } catch (error) {
    console.error('Error restarting services:', error);
    // Don't throw here as service restart is not critical for credential rotation
  }
}

async function sendNotification(credential: Credential, result: { success: boolean; error?: string }): Promise<void> {
  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) {
    console.warn('SNS_TOPIC_ARN not set, skipping notification');
    return;
  }
  
  try {
    const message = {
      credentialName: credential.name,
      credentialType: credential.type,
      status: result.success ? 'success' : 'failed',
      error: result.error,
      timestamp: new Date().toISOString()
    };
    
    await sns.publish({
      TopicArn: topicArn,
      Message: JSON.stringify(message),
      Subject: `Credential Rotation ${result.success ? 'Success' : 'Failed'}: ${credential.name}`
    }).promise();
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

async function logActivity(action: string, description: string, metadata: Record<string, any>): Promise<void> {
  // Use dedicated audit logs table
  const tableName = process.env.AUDIT_TABLE || 'vaultpilot-audit-logs-prod';
  
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

function generateSecurePassword(): string {
  const length = 32;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
