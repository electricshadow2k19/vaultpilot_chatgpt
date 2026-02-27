# VaultPilot Deployment Guide

## Overview

This guide covers deploying VaultPilot to AWS using Terraform and Serverless Framework.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Terraform >= 1.0
- Node.js >= 18
- npm >= 8
- Serverless Framework

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/vaultpilot.git
cd vaultpilot
chmod +x scripts/*.sh
```

### 2. Configure AWS

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region
```

### 3. Deploy Infrastructure

```bash
./scripts/deploy.sh dev us-east-1
```

### 4. Access Application

- Frontend: https://vaultpilot.your-domain.com
- API: https://api.vaultpilot.your-domain.com

## Manual Deployment

### Infrastructure

1. **Initialize Terraform**
```bash
cd infrastructure
terraform init
```

2. **Plan Deployment**
```bash
terraform plan -var="environment=dev" -var="aws_region=us-east-1"
```

3. **Apply Infrastructure**
```bash
terraform apply -var="environment=dev" -var="aws_region=us-east-1"
```

4. **Get Outputs**
```bash
terraform output
```

### Backend Services

1. **Install Dependencies**
```bash
cd backend
npm install
```

2. **Deploy Lambda Functions**
```bash
npm run deploy
```

### Frontend

1. **Install Dependencies**
```bash
cd frontend
npm install
```

2. **Build Application**
```bash
npm run build
```

3. **Deploy to S3**
```bash
npm run deploy
```

## Environment Configuration

### Development

```bash
# Set environment variables
export AWS_REGION=us-east-1
export ENVIRONMENT=dev
export DOMAIN_NAME=your-domain.com
```

### Production

```bash
# Set environment variables
export AWS_REGION=us-east-1
export ENVIRONMENT=prod
export DOMAIN_NAME=vaultpilot.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
```

## Multi-Environment Setup

### Development Environment

```bash
./scripts/deploy.sh dev us-east-1
```

### Staging Environment

```bash
./scripts/deploy.sh staging us-east-1
```

### Production Environment

```bash
./scripts/deploy.sh prod us-east-1
```

## Custom Configuration

### Terraform Variables

Create a `terraform.tfvars` file:

```hcl
environment = "prod"
aws_region = "us-east-1"
domain_name = "vaultpilot.com"
certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"
notification_email = "admin@vaultpilot.com"
slack_webhook_url = "https://hooks.slack.com/services/..."
github_token = "ghp_..."
rotation_schedule = "rate(1 day)"
backup_retention_days = 30
log_retention_days = 14
enable_monitoring = true
enable_notifications = true
```

### Serverless Configuration

Update `backend/*/serverless.yml`:

```yaml
provider:
  name: aws
  runtime: nodejs18.x
  region: ${opt:region, 'us-east-1'}
  stage: ${opt:stage, 'prod'}
  environment:
    DYNAMODB_TABLE: ${self:custom.dynamodb.table}
    SECRETS_MANAGER_PREFIX: ${self:custom.secretsManager.prefix}
    SNS_TOPIC_ARN: ${self:custom.sns.topicArn}
```

## Monitoring and Logging

### CloudWatch Dashboard

Access the CloudWatch dashboard to monitor:
- Lambda function performance
- DynamoDB metrics
- API Gateway metrics
- Error rates and latency

### Logs

View logs in CloudWatch:
- Lambda logs: `/aws/lambda/vaultpilot-*`
- API Gateway logs: `/aws/apigateway/vaultpilot-api`
- Application logs: `/aws/vaultpilot/application`

### Alerts

Configure CloudWatch alarms for:
- High error rates
- High latency
- Failed rotations
- Credential expirations

## Security Configuration

### IAM Roles

VaultPilot creates the following IAM roles:
- `vaultpilot-lambda-role` - For Lambda functions
- `vaultpilot-authenticated-role` - For authenticated users
- `vaultpilot-discovery-role` - For credential discovery

### KMS Encryption

All sensitive data is encrypted using AWS KMS:
- DynamoDB tables
- Secrets Manager secrets
- SSM parameters
- S3 objects

### Network Security

- VPC with private subnets
- Security groups with minimal access
- NAT Gateway for outbound internet access
- VPC Endpoints for AWS services

## Backup and Recovery

### DynamoDB Backups

- Point-in-time recovery enabled
- Automated backups with 30-day retention
- Cross-region replication for production

### Secrets Backup

- Secrets Manager automatic backups
- Cross-region replication
- Version history maintained

### Disaster Recovery

1. **RTO**: 4 hours
2. **RPO**: 1 hour
3. **Recovery Process**:
   - Restore from backups
   - Update DNS records
   - Verify functionality

## Scaling

### Auto Scaling

- Lambda functions auto-scale
- DynamoDB on-demand billing
- API Gateway auto-scales

### Performance Tuning

- Lambda memory allocation
- DynamoDB read/write capacity
- API Gateway throttling limits

## Troubleshooting

### Common Issues

1. **Deployment Failures**
   - Check AWS credentials
   - Verify permissions
   - Check resource limits

2. **Lambda Timeouts**
   - Increase timeout settings
   - Optimize code
   - Check dependencies

3. **DynamoDB Throttling**
   - Increase capacity
   - Optimize queries
   - Use batch operations

### Debug Commands

```bash
# Check Lambda logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/vaultpilot

# Check DynamoDB metrics
aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB --metric-name ConsumedReadCapacityUnits

# Check API Gateway logs
aws logs describe-log-groups --log-group-name-prefix /aws/apigateway
```

## Maintenance

### Regular Tasks

1. **Weekly**:
   - Review audit logs
   - Check credential status
   - Monitor performance metrics

2. **Monthly**:
   - Update dependencies
   - Review security settings
   - Backup verification

3. **Quarterly**:
   - Security audit
   - Performance review
   - Disaster recovery test

### Updates

1. **Infrastructure Updates**
```bash
cd infrastructure
terraform plan
terraform apply
```

2. **Application Updates**
```bash
cd backend
npm run deploy
cd ../frontend
npm run build
npm run deploy
```

## Support

For deployment issues:
- Documentation: https://docs.vaultpilot.com
- GitHub Issues: https://github.com/your-org/vaultpilot/issues
- Email: support@vaultpilot.com
