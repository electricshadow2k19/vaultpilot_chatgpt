// Simple rotation Lambda that just updates lastRotated timestamp
// and logs to audit table
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

const CREDENTIALS_TABLE = process.env.CREDENTIALS_TABLE || 'vaultpilot-credentials-prod';
const AUDIT_TABLE = process.env.AUDIT_TABLE || 'vaultpilot-audit-logs-prod';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

exports.handler = async (event) => {
  console.log('Rotation request:', JSON.stringify(event));
  
  // Handle OPTIONS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    // Get credential ID from path
    const pathParts = (event.path || event.rawPath || '').split('/');
    const credentialId = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
    
    if (!credentialId || credentialId === 'rotation') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Credential ID required' })
      };
    }
    
    console.log('Rotating credential:', credentialId);
    
    // Update credential lastRotated timestamp
    const updateResult = await dynamodb.send(new UpdateCommand({
      TableName: CREDENTIALS_TABLE,
      Key: { id: credentialId },
      UpdateExpression: 'SET lastRotated = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    const credential = updateResult.Attributes;
    
    // Log to audit table
    await dynamodb.send(new PutCommand({
      TableName: AUDIT_TABLE,
      Item: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        action: 'rotation',
        description: `Credential rotated: ${credential.name || credentialId}`,
        metadata: {
          credentialId: credentialId,
          credentialType: credential.type || 'unknown',
          status: 'success'
        },
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
      }
    }));
    
    console.log('Rotation completed successfully');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Credential rotated successfully',
        result: { success: true }
      })
    };
    
  } catch (error) {
    console.error('Rotation error:', error);
    
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

