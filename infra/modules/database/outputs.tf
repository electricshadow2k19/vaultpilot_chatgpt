# Database module outputs

output "table_name" {
  description = "Main credentials table name"
  value       = aws_dynamodb_table.credentials.name
}

output "table_arn" {
  description = "Main credentials table ARN"
  value       = aws_dynamodb_table.credentials.arn
}

output "audit_logs_table_name" {
  description = "Audit logs table name"
  value       = aws_dynamodb_table.audit_logs.name
}

output "audit_logs_table_arn" {
  description = "Audit logs table ARN"
  value       = aws_dynamodb_table.audit_logs.arn
}

output "settings_table_name" {
  description = "Settings table name"
  value       = aws_dynamodb_table.settings.name
}

output "settings_table_arn" {
  description = "Settings table ARN"
  value       = aws_dynamodb_table.settings.arn
}

output "rotation_schedules_table_name" {
  description = "Rotation schedules table name"
  value       = aws_dynamodb_table.rotation_schedules.name
}

output "rotation_schedules_table_arn" {
  description = "Rotation schedules table ARN"
  value       = aws_dynamodb_table.rotation_schedules.arn
}
