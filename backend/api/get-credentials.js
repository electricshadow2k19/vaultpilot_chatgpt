// Simple Lambda to fetch credentials from DynamoDB
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
  console.log('Fetching credentials from DynamoDB...');
  
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
  
  try {
    const result = await dynamodb.send(new ScanCommand({
      TableName: 'vaultpilot-credentials-prod'
    }));
    
    console.log(`Found ${result.Items?.length || 0} credentials`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        credentials: result.Items || [],
        count: result.Items?.length || 0
      })
    };
    
  } catch (error) {
    console.error('Error fetching credentials:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch credentials',
        message: error.message
      })
    };
  }
};
