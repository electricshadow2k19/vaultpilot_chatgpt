# VaultPilot API Documentation

## Overview

VaultPilot provides a RESTful API for managing credentials, rotations, and audit logs. All API endpoints require authentication via AWS Cognito.

## Base URL

```
https://api.vaultpilot.com/v1
```

## Authentication

All API requests must include a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Credentials

#### Get All Credentials
```http
GET /credentials
```

**Response:**
```json
{
  "credentials": [
    {
      "id": "cred-123",
      "name": "Production DB Password",
      "type": "Database",
      "environment": "Production",
      "lastRotated": "2024-01-15",
      "expiresIn": 45,
      "status": "active",
      "description": "Main production database credentials",
      "source": "Secrets Manager",
      "metadata": {
        "arn": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod-db-password",
        "lastChanged": "2024-01-15T10:30:00Z"
      }
    }
  ]
}
```

#### Get Credential by ID
```http
GET /credentials/{credentialId}
```

#### Create Credential
```http
POST /credentials
```

**Request Body:**
```json
{
  "name": "New API Token",
  "type": "API Token",
  "environment": "Production",
  "description": "External service API token",
  "source": "Manual",
  "metadata": {
    "service": "external-api",
    "endpoint": "https://api.external.com"
  }
}
```

#### Update Credential
```http
PUT /credentials/{credentialId}
```

#### Delete Credential
```http
DELETE /credentials/{credentialId}
```

### Rotation

#### Rotate Credential
```http
POST /rotation/{credentialId}
```

**Response:**
```json
{
  "message": "Credential rotated successfully",
  "result": {
    "success": true,
    "newExpirationDate": "2024-04-15"
  }
}
```

#### Get Rotation History
```http
GET /rotation/{credentialId}/history
```

### Discovery

#### Start Discovery
```http
POST /discovery
```

**Response:**
```json
{
  "message": "Discovery completed successfully",
  "credentialsFound": 15,
  "credentials": [
    {
      "id": "cred-456",
      "name": "AWS Access Key - user1",
      "type": "AWS IAM",
      "environment": "Production",
      "lastRotated": "2024-01-10",
      "expiresIn": 5,
      "status": "expiring"
    }
  ]
}
```

### Audit Logs

#### Get Audit Logs
```http
GET /audit
```

**Query Parameters:**
- `action` - Filter by action type
- `status` - Filter by status
- `startDate` - Start date (ISO 8601)
- `endDate` - End date (ISO 8601)
- `limit` - Number of results (default: 100)
- `offset` - Pagination offset

**Response:**
```json
{
  "logs": [
    {
      "id": "log-789",
      "timestamp": "2024-01-20T10:30:00Z",
      "action": "Credential Rotation",
      "credentialName": "Production DB Password",
      "credentialType": "Database",
      "user": "admin@company.com",
      "status": "success",
      "details": "Successfully rotated database password",
      "ipAddress": "192.168.1.100"
    }
  ],
  "total": 150,
  "offset": 0,
  "limit": 100
}
```

### Settings

#### Get Settings
```http
GET /settings
```

#### Update Settings
```http
PUT /settings
```

**Request Body:**
```json
{
  "notifications": {
    "email": true,
    "slack": false,
    "rotationAlerts": true,
    "expirationWarnings": true,
    "securityAlerts": true
  },
  "rotation": {
    "autoRotation": true,
    "rotationInterval": 90,
    "warningDays": 30,
    "dryRunMode": false
  },
  "security": {
    "requireMFA": true,
    "sessionTimeout": 30,
    "auditRetention": 365,
    "encryptionLevel": "high"
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-20T10:30:00Z"
}
```

### Common Error Codes

- `UNAUTHORIZED` - Invalid or missing authentication token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request data
- `ROTATION_FAILED` - Credential rotation failed
- `DISCOVERY_FAILED` - Credential discovery failed
- `RATE_LIMITED` - Too many requests

## Rate Limiting

API requests are rate limited to:
- 1000 requests per hour per user
- 100 requests per minute per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642680000
```

## Webhooks

VaultPilot can send webhooks for important events:

### Rotation Completed
```json
{
  "event": "rotation.completed",
  "timestamp": "2024-01-20T10:30:00Z",
  "data": {
    "credentialId": "cred-123",
    "credentialName": "Production DB Password",
    "status": "success",
    "newExpirationDate": "2024-04-15"
  }
}
```

### Credential Expiring
```json
{
  "event": "credential.expiring",
  "timestamp": "2024-01-20T10:30:00Z",
  "data": {
    "credentialId": "cred-123",
    "credentialName": "Production DB Password",
    "expiresIn": 5,
    "action": "rotation_required"
  }
}
```

## SDK Examples

### JavaScript/Node.js
```javascript
const VaultPilot = require('@vaultpilot/sdk');

const client = new VaultPilot({
  apiKey: 'your-api-key',
  baseURL: 'https://api.vaultpilot.com/v1'
});

// Get all credentials
const credentials = await client.credentials.list();

// Rotate a credential
const result = await client.rotation.rotate('cred-123');
```

### Python
```python
from vaultpilot import VaultPilot

client = VaultPilot(
    api_key='your-api-key',
    base_url='https://api.vaultpilot.com/v1'
)

# Get all credentials
credentials = client.credentials.list()

# Rotate a credential
result = client.rotation.rotate('cred-123')
```

## Support

For API support and questions:
- Email: api-support@vaultpilot.com
- Documentation: https://docs.vaultpilot.com
- Status Page: https://status.vaultpilot.com
