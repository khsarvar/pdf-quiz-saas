output "secrets_arn" {
  description = "ARN of the Secrets Manager secret"
  value       = aws_secretsmanager_secret.app.arn
}

output "secrets_read_policy_arn" {
  description = "ARN of the secrets read IAM policy"
  value       = aws_iam_policy.secrets_read.arn
}
