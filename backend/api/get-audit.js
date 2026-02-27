// Lambda to fetch audit logs from DynamoDB
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
  console.log('Fetching audit logs from DynamoDB...');
  
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
  
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    // Use environment variable or default to prod
    const tableName = process.env.AUDIT_TABLE || 'vaultpilot-audit-logs-prod';
    
    // Get date range from query params (optional)
    const range = event.queryStringParameters?.range || '7';
    const daysAgo = parseInt(range);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
    const cutoffTimestamp = cutoffDate.toISOString();
    
    console.log(`Fetching logs from last ${daysAgo} days (since ${cutoffTimestamp}) from table: ${tableName}`);
    
    // Scan audit logs table
    const result = await dynamodb.send(new ScanCommand({
      TableName: tableName
    }));
    
    // Filter by date if needed
    let logs = result.Items || [];
    logs = logs.filter(log => !log.timestamp || log.timestamp >= cutoffTimestamp);
    
    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => {
      const timeA = a.timestamp || '2000-01-01';
      const timeB = b.timestamp || '2000-01-01';
      return timeB.localeCompare(timeA);
    });
    
    console.log(`Found ${logs.length} audit logs in date range`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        logs: logs,
        count: logs.length,
        range: daysAgo
      })
    };
    
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch audit logs',
        message: error.message
      })
    };
  }
};

