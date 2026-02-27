/**
 * Error Handling and Rollback Module
 * Handles errors during credential rotation and provides rollback capabilities
 */

import { DynamoDB, SecretsManager, SSM, SNS } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const dynamodb = new DynamoDB.DocumentClient();
const secretsManager = new SecretsManager();
const ssm = new SSM();
const sns = new SNS();

interface CredentialBackup {
  id: string;
  credentialId: string;
  credentialName: string;
  credentialType: string;
  oldValue: any;
  backupTimestamp: string;
  expiresAt: string;
}

interface RotationAttempt {
  attemptId: string;
  credentialId: string;
  startTime: string;
  endTime?: string;
  status: 'in_progress' | 'success' | 'failed' | 'rolled_back';
  error?: string;
  retryCount: number;
  backupId?: string;
}

const MAX_RETRY_ATTEMPTS = 3;
const BACKUP_RETENTION_HOURS = 24;

/**
 * Create a backup of the current credential before rotation
 */
export async function createCredentialBackup(
  credentialId: string,
  credentialName: string,
  credentialType: string,
  currentValue: any
): Promise<CredentialBackup> {
  const backup: CredentialBackup = {
    id: uuidv4(),
    credentialId,
    credentialName,
    credentialType,
    oldValue: currentValue,
    backupTimestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + BACKUP_RETENTION_HOURS * 60 * 60 * 1000).toISOString()
  };
  
  try {
    // Store backup in DynamoDB
    await dynamodb.put({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      Item: {
        ...backup,
        type: 'credential_backup',
        ttl: Math.floor(Date.now() / 1000) + (BACKUP_RETENTION_HOURS * 60 * 60)
      }
    }).promise();
    
    console.log(`Created backup ${backup.id} for credential ${credentialId}`);
    return backup;
  } catch (error) {
    console.error(`Failed to create backup for credential ${credentialId}:`, error);
    throw new Error(`Backup creation failed: ${error.message}`);
  }
}

/**
 * Rollback to previous credential value
 */
export async function rollbackCredential(
  backupId: string,
  credentialId: string
): Promise<boolean> {
  try {
    console.log(`Rolling back credential ${credentialId} using backup ${backupId}`);
    
    // Retrieve backup
    const backup = await getBackup(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }
    
    // Restore old value based on credential type
    await restoreCredentialValue(backup);
    
    // Log rollback
    await logRollback(credentialId, backupId);
    
    // Send alert
    await sendRollbackAlert(credentialId, backup.credentialName);
    
    console.log(`Successfully rolled back credential ${credentialId}`);
    return true;
  } catch (error) {
    console.error(`Rollback failed for credential ${credentialId}:`, error);
    throw new Error(`Rollback failed: ${error.message}`);
  }
}

/**
 * Get backup from DynamoDB
 */
async function getBackup(backupId: string): Promise<CredentialBackup | null> {
  try {
    const result = await dynamodb.get({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      Key: { id: backupId }
    }).promise();
    
    return result.Item as CredentialBackup || null;
  } catch (error) {
    console.error(`Failed to retrieve backup ${backupId}:`, error);
    return null;
  }
}

/**
 * Restore credential value from backup
 */
async function restoreCredentialValue(backup: CredentialBackup): Promise<void> {
  try {
    switch (backup.credentialType) {
      case 'AWS IAM':
        // Restore IAM access key (would need to recreate the old key)
        console.log(`Restoring AWS IAM credential: ${backup.credentialName}`);
        // Note: AWS doesn't allow restoring old access keys, so we'd need to
        // keep the old key active during rotation and only delete after verification
        break;
        
      case 'Database':
      case 'SMTP':
      case 'GitHub':
      case 'API Token':
        // Restore in Secrets Manager or SSM
        await secretsManager.updateSecret({
          SecretId: backup.credentialName,
          SecretString: JSON.stringify(backup.oldValue)
        }).promise();
        break;
        
      default:
        throw new Error(`Unsupported credential type: ${backup.credentialType}`);
    }
  } catch (error) {
    console.error(`Failed to restore credential value:`, error);
    throw error;
  }
}

/**
 * Execute rotation with automatic retry and rollback
 */
export async function executeRotationWithRetry(
  credentialId: string,
  rotationFunction: () => Promise<any>,
  backupId: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const attemptId = uuidv4();
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      console.log(`Rotation attempt ${attempt}/${MAX_RETRY_ATTEMPTS} for credential ${credentialId}`);
      
      // Record attempt
      await recordRotationAttempt({
        attemptId,
        credentialId,
        startTime: new Date().toISOString(),
        status: 'in_progress',
        retryCount: attempt,
        backupId
      });
      
      // Execute rotation
      const result = await rotationFunction();
      
      // Record success
      await recordRotationAttempt({
        attemptId,
        credentialId,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        status: 'success',
        retryCount: attempt,
        backupId
      });
      
      return { success: true, result };
      
    } catch (error) {
      lastError = error;
      console.error(`Rotation attempt ${attempt} failed:`, error);
      
      // Record failure
      await recordRotationAttempt({
        attemptId,
        credentialId,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        status: 'failed',
        error: error.message,
        retryCount: attempt,
        backupId
      });
      
      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // All retries failed - initiate rollback
  console.error(`All ${MAX_RETRY_ATTEMPTS} rotation attempts failed. Initiating rollback...`);
  
  try {
    await rollbackCredential(backupId, credentialId);
    
    await recordRotationAttempt({
      attemptId,
      credentialId,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      status: 'rolled_back',
      error: lastError?.message,
      retryCount: MAX_RETRY_ATTEMPTS,
      backupId
    });
    
    return {
      success: false,
      error: `Rotation failed after ${MAX_RETRY_ATTEMPTS} attempts. Rolled back to previous value. Error: ${lastError?.message}`
    };
  } catch (rollbackError) {
    console.error(`Rollback also failed:`, rollbackError);
    
    // Send critical alert
    await sendCriticalAlert(credentialId, lastError?.message, rollbackError.message);
    
    return {
      success: false,
      error: `Rotation and rollback both failed. Manual intervention required. Rotation error: ${lastError?.message}, Rollback error: ${rollbackError.message}`
    };
  }
}

/**
 * Record rotation attempt in DynamoDB
 */
async function recordRotationAttempt(attempt: RotationAttempt): Promise<void> {
  try {
    await dynamodb.put({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      Item: {
        ...attempt,
        id: attempt.attemptId,
        type: 'rotation_attempt',
        timestamp: new Date().toISOString()
      }
    }).promise();
  } catch (error) {
    console.error(`Failed to record rotation attempt:`, error);
  }
}

/**
 * Log rollback event
 */
async function logRollback(credentialId: string, backupId: string): Promise<void> {
  try {
    await dynamodb.put({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      Item: {
        id: uuidv4(),
        type: 'audit_log',
        action: 'rollback',
        credentialId,
        backupId,
        timestamp: new Date().toISOString(),
        description: `Rolled back credential ${credentialId} to backup ${backupId}`
      }
    }).promise();
  } catch (error) {
    console.error(`Failed to log rollback:`, error);
  }
}

/**
 * Send rollback alert
 */
async function sendRollbackAlert(credentialId: string, credentialName: string): Promise<void> {
  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) {
    console.warn('SNS_TOPIC_ARN not set, skipping rollback alert');
    return;
  }
  
  try {
    await sns.publish({
      TopicArn: topicArn,
      Subject: `⚠️ VaultPilot: Credential Rotation Rolled Back`,
      Message: JSON.stringify({
        alert: 'Credential rotation was rolled back',
        credentialId,
        credentialName,
        timestamp: new Date().toISOString(),
        action: 'Please investigate the rotation failure'
      }, null, 2)
    }).promise();
  } catch (error) {
    console.error(`Failed to send rollback alert:`, error);
  }
}

/**
 * Send critical alert for failed rotation and rollback
 */
async function sendCriticalAlert(
  credentialId: string,
  rotationError: string | undefined,
  rollbackError: string
): Promise<void> {
  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) {
    console.warn('SNS_TOPIC_ARN not set, skipping critical alert');
    return;
  }
  
  try {
    await sns.publish({
      TopicArn: topicArn,
      Subject: `🚨 CRITICAL: VaultPilot Rotation and Rollback Failed`,
      Message: JSON.stringify({
        alert: 'CRITICAL: Both rotation and rollback failed',
        credentialId,
        rotationError,
        rollbackError,
        timestamp: new Date().toISOString(),
        action: 'IMMEDIATE MANUAL INTERVENTION REQUIRED'
      }, null, 2)
    }).promise();
  } catch (error) {
    console.error(`Failed to send critical alert:`, error);
  }
}

/**
 * Validate credential before rotation
 */
export async function validateCredentialBeforeRotation(
  credentialId: string,
  credentialType: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check if credential exists
    const credential = await dynamodb.get({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      Key: { id: credentialId }
    }).promise();
    
    if (!credential.Item) {
      return { valid: false, error: 'Credential not found' };
    }
    
    // Check if credential is not already being rotated
    const existingAttempts = await dynamodb.query({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      IndexName: 'type-timestamp-index',
      KeyConditionExpression: '#type = :type',
      FilterExpression: 'credentialId = :credentialId AND #status = :status',
      ExpressionAttributeNames: {
        '#type': 'type',
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':type': 'rotation_attempt',
        ':credentialId': credentialId,
        ':status': 'in_progress'
      }
    }).promise();
    
    if (existingAttempts.Items && existingAttempts.Items.length > 0) {
      return { valid: false, error: 'Credential rotation already in progress' };
    }
    
    return { valid: true };
  } catch (error) {
    console.error(`Validation failed for credential ${credentialId}:`, error);
    return { valid: false, error: error.message };
  }
}

/**
 * Clean up old backups (called periodically)
 */
export async function cleanupExpiredBackups(): Promise<number> {
  try {
    const now = new Date().toISOString();
    
    const result = await dynamodb.scan({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      FilterExpression: '#type = :type AND expiresAt < :now',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':type': 'credential_backup',
        ':now': now
      }
    }).promise();
    
    if (!result.Items || result.Items.length === 0) {
      return 0;
    }
    
    // Delete expired backups
    for (const item of result.Items) {
      await dynamodb.delete({
        TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
        Key: { id: item.id }
      }).promise();
    }
    
    console.log(`Cleaned up ${result.Items.length} expired backups`);
    return result.Items.length;
  } catch (error) {
    console.error(`Failed to clean up expired backups:`, error);
    return 0;
  }
}
