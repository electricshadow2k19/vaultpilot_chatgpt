const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE || 'vaultpilot-accounts-prod';

exports.handler = async (event) => {
  console.log('Fetching AWS accounts...', JSON.stringify(event, null, 2));

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };

  try {
    const result = await dynamodb.send(new ScanCommand({
      TableName: ACCOUNTS_TABLE
    }));

    const accounts = result.Items || [];
    
    console.log(`Found ${accounts.length} accounts`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        accounts: accounts,
        count: accounts.length
      })
    };
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch accounts',
        message: error.message
      })
    };
  }
};









