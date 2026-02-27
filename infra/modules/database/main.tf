# DynamoDB Tables for VaultPilot

# Main credentials table
resource "aws_dynamodb_table" "credentials" {
  name           = "vaultpilot-credentials-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  range_key      = "type"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name     = "type-timestamp-index"
    hash_key = "type"
    range_key = "timestamp"
  }

  global_secondary_index {
    name     = "status-index"
    hash_key = "status"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}

# Audit logs table
resource "aws_dynamodb_table" "audit_logs" {
  name           = "vaultpilot-audit-logs-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  range_key      = "timestamp"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "action"
    type = "S"
  }

  global_secondary_index {
    name     = "action-timestamp-index"
    hash_key = "action"
    range_key = "timestamp"
  }

  global_secondary_index {
    name     = "user-index"
    hash_key = "user"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}

# Settings table
resource "aws_dynamodb_table" "settings" {
  name           = "vaultpilot-settings-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}

# DynamoDB table for storing rotation schedules
resource "aws_dynamodb_table" "rotation_schedules" {
  name           = "vaultpilot-rotation-schedules-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "credential_id"
  range_key      = "schedule_id"

  attribute {
    name = "credential_id"
    type = "S"
  }

  attribute {
    name = "schedule_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}
