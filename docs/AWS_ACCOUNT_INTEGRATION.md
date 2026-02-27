# 🔗 AWS Account Integration Guide

## How to Connect Customer AWS Accounts to VaultPilot

VaultPilot uses **IAM Cross-Account Roles** to securely access customer AWS accounts and rotate their credentials.

---

## 📋 **Two Approaches:**

### **Approach 1: Multi-Tenant SaaS (Recommended for Production)**
Customers create an IAM role in their account that trusts YOUR VaultPilot account.

### **Approach 2: Single-Tenant (Current Deployment)**
VaultPilot runs in the same account where credentials are managed.

---

## 🎯 **Current Setup (Same Account)**

Right now, VaultPilot is deployed in **your AWS account** (`700880967608`) and can already:

✅ Scan IAM users and access keys in your account  
✅ Discover Secrets Manager secrets in your account  
✅ Rotate credentials in your account  

**To test it NOW:**

```bash
# Get your API endpoint
aws cloudformation describe-stacks \
  --stack-name VaultPilot-Production \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text

# Output: https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com

# Run discovery to scan your current account
curl -X POST https://YOUR_API_ENDPOINT/discovery

# Check what was found
aws dynamodb scan --table-name vaultpilot-credentials-prod --region us-east-1
```

---

## 🚀 **How to Connect ANOTHER AWS Account (Multi-Tenant)**

### **Step 1: Customer Creates IAM Role**

The customer (or another AWS account) runs this in THEIR account:

```bash
# Replace with YOUR VaultPilot account ID
VAULTPILOT_ACCOUNT_ID="700880967608"

# Create trust policy
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${VAULTPILOT_ACCOUNT_ID}:role/VaultPilot-Lambda-prod"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "vaultpilot-secure-external-id-12345"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name VaultPilotAccess \
  --assume-role-policy-document file://trust-policy.json

# Attach permissions for VaultPilot to manage credentials
cat > vaultpilot-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DiscoverCredentials",
      "Effect": "Allow",
      "Action": [
        "iam:ListUsers",
        "iam:ListAccessKeys",
        "iam:GetUser",
        "secretsmanager:ListSecrets",
        "secretsmanager:DescribeSecret",
        "ssm:DescribeParameters",
        "rds:DescribeDBInstances",
        "rds:DescribeDBClusters"
      ],
      "Resource": "*"
    },
    {
      "Sid": "RotateCredentials",
      "Effect": "Allow",
      "Action": [
        "iam:CreateAccessKey",
        "iam:DeleteAccessKey",
        "iam:UpdateAccessKey",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:UpdateSecret",
        "secretsmanager:RotateSecret",
        "ssm:GetParameter",
        "ssm:PutParameter"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name VaultPilotAccess \
  --policy-name VaultPilotPermissions \
  --policy-document file://vaultpilot-policy.json

# Get the Role ARN (customer sends this to you)
aws iam get-role --role-name VaultPilotAccess --query 'Role.Arn' --output text
# Output: arn:aws:iam::CUSTOMER_ACCOUNT_ID:role/VaultPilotAccess
```

### **Step 2: Customer Shares Role ARN with You**

Customer provides:
- **Role ARN**: `arn:aws:iam::123456789012:role/VaultPilotAccess`
- **External ID**: `vaultpilot-secure-external-id-12345`
- **AWS Account ID**: `123456789012`
- **Account Name**: "Acme Corp Production"

### **Step 3: Add Customer Account to VaultPilot**

#### **Option A: Via Dashboard (Frontend)**

1. Go to **Settings** page in VaultPilot dashboard
2. Click "**Add AWS Account**"
3. Fill in the form:
   - Account Name: `Acme Corp Production`
   - AWS Account ID: `123456789012`
   - Role ARN: `arn:aws:iam::123456789012:role/VaultPilotAccess`
   - External ID: `vaultpilot-secure-external-id-12345`
   - Regions to Scan: `us-east-1, us-west-2`
4. Click "**Connect & Test**"

#### **Option B: Via API**

```bash
curl -X POST https://YOUR_API_ENDPOINT/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "Acme Corp Production",
    "accountId": "123456789012",
    "roleArn": "arn:aws:iam::123456789012:role/VaultPilotAccess",
    "externalId": "vaultpilot-secure-external-id-12345",
    "regions": ["us-east-1", "us-west-2"],
    "autoRotate": true,
    "rotationPolicy": {
      "maxAge": 90,
      "warningThreshold": 15
    }
  }'
```

#### **Option C: Directly in DynamoDB** (temporary until UI is ready)

```bash
aws dynamodb put-item \
  --table-name vaultpilot-credentials-prod \
  --item '{
    "id": {"S": "account-123456789012"},
    "tenantId": {"S": "acme-corp"},
    "type": {"S": "AWS_ACCOUNT"},
    "name": {"S": "Acme Corp Production"},
    "metadata": {
      "M": {
        "accountId": {"S": "123456789012"},
        "roleArn": {"S": "arn:aws:iam::123456789012:role/VaultPilotAccess"},
        "externalId": {"S": "vaultpilot-secure-external-id-12345"},
        "regions": {"L": [{"S": "us-east-1"}, {"S": "us-west-2"}]}
      }
    },
    "status": {"S": "active"},
    "createdAt": {"S": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}
  }' \
  --region us-east-1
```

### **Step 4: Update Lambda to Use Cross-Account Roles**

The Lambda functions need to assume the customer's role before scanning:

```javascript
// In Lambda discovery function
const { STS } = require('aws-sdk');
const sts = new STS();

async function getCustomerCredentials(accountConfig) {
  const assumeRoleParams = {
    RoleArn: accountConfig.roleArn,
    RoleSessionName: 'VaultPilotDiscovery',
    ExternalId: accountConfig.externalId,
    DurationSeconds: 3600
  };
  
  const { Credentials } = await sts.assumeRole(assumeRoleParams).promise();
  
  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken
  };
}

// Use these credentials to create AWS service clients
const customerIAM = new IAM(await getCustomerCredentials(accountConfig));
const users = await customerIAM.listUsers({}).promise();
```

---

## 🖥️ **Dashboard Settings Page Implementation**

Let me update the Settings page to include AWS account connection:

### **UI Features:**

1. **Connected Accounts List**
   - Show all connected AWS accounts
   - Status: Active, Error, Testing
   - Last scan time
   - Number of credentials found

2. **Add Account Button**
   - Opens modal with form
   - Fields: Account Name, Account ID, Role ARN, External ID
   - "Test Connection" button validates access

3. **Account Actions**
   - Scan Now (trigger discovery immediately)
   - Edit (update role ARN)
   - Remove (disconnect account)
   - View Credentials (filter by account)

---

## 🔐 **Security Best Practices**

### **1. Use External ID** (prevents confused deputy problem)
```json
{
  "Condition": {
    "StringEquals": {
      "sts:ExternalId": "unique-random-string-per-customer"
    }
  }
}
```

### **2. Least Privilege IAM Policy**
Only grant permissions VaultPilot actually needs:
- ✅ ListUsers, ListAccessKeys (discovery)
- ✅ CreateAccessKey, DeleteAccessKey (rotation)
- ❌ DeleteUser, CreateUser (NOT needed)

### **3. Audit Trail**
Every cross-account action is logged:
- Who assumed the role
- What actions were performed
- Which credentials were rotated
- Timestamp and session ID

### **4. Session Duration**
Use short-lived credentials (1 hour):
```javascript
DurationSeconds: 3600
```

---

## 📊 **Multi-Tenant Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                    VaultPilot (Your Account)                │
│                                                             │
│  ┌─────────────┐      ┌──────────────┐                    │
│  │  Dashboard  │◄────►│  API Gateway │                    │
│  └─────────────┘      └──────┬───────┘                    │
│                              │                              │
│                    ┌─────────▼────────┐                    │
│                    │  Lambda Function  │                    │
│                    │  (Discovery)      │                    │
│                    └─────────┬────────┘                    │
│                              │                              │
│                         Uses STS                            │
│                    AssumeRole()                             │
└─────────────────────────────┼───────────────────────────────┘
                              │
                ┌─────────────┴────────────┐
                │                          │
        ┌───────▼────────┐        ┌───────▼────────┐
        │  Customer A     │        │  Customer B     │
        │  Account        │        │  Account        │
        │  123456789012   │        │  987654321098   │
        │                 │        │                 │
        │  IAM Role:      │        │  IAM Role:      │
        │  VaultPilot     │        │  VaultPilot     │
        │  Access         │        │  Access         │
        │                 │        │                 │
        │  • IAM Keys     │        │  • IAM Keys     │
        │  • Secrets      │        │  • Secrets      │
        │  • RDS          │        │  • RDS          │
        └─────────────────┘        └─────────────────┘
```

---

## ✅ **Quick Test (Same Account)**

Since VaultPilot is already in your account, test it RIGHT NOW:

```bash
# 1. Get your API endpoint
API=$(aws cloudformation describe-stacks --stack-name VaultPilot-Production --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)

echo "API Endpoint: $API"

# 2. Run discovery (will scan YOUR account)
curl -X POST $API/discovery

# 3. Wait 10 seconds for processing
sleep 10

# 4. Check what was found
aws dynamodb scan --table-name vaultpilot-credentials-prod --region us-east-1 --max-items 5

# 5. View audit logs
aws dynamodb scan --table-name vaultpilot-audit-logs-prod --region us-east-1 --max-items 5
```

You should see:
- Your IAM users and their access keys
- Age of each key (in days)
- Status: active, expiring, or expired

---

## 🎯 **Next: Update Settings UI**

Would you like me to:
1. ✅ Update the Settings page with "Connect AWS Account" form
2. ✅ Add account management table
3. ✅ Create API endpoint for adding accounts
4. ✅ Update Lambda to support cross-account access

Let me know and I'll implement it!

---

**Generated**: 2025-10-18  
**Your VaultPilot Account**: 700880967608  
**Lambda Role ARN**: Check CloudFormation outputs

