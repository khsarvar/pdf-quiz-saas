# Secrets Manager Secret
resource "aws_secretsmanager_secret" "app" {
  name        = "${var.project_name}/${var.environment}/app-secrets"
  description = "Application secrets for ${var.project_name} ${var.environment}"

  tags = {
    Name = "${var.project_name}-${var.environment}-secrets"
  }
}

# Secret Version with all application secrets
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DB_PASSWORD           = var.db_password
    STRIPE_SECRET_KEY     = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
    OPENAI_API_KEY        = var.openai_api_key
    R2_ACCOUNT_ID         = var.r2_account_id
    R2_ACCESS_KEY_ID      = var.r2_access_key_id
    R2_SECRET_ACCESS_KEY  = var.r2_secret_access_key
    R2_BUCKET_NAME        = var.r2_bucket_name
    JWT_SECRET            = var.jwt_secret
  })
}

# IAM Policy for reading secrets
resource "aws_iam_policy" "secrets_read" {
  name        = "${var.project_name}-${var.environment}-secrets-read"
  description = "Policy for ECS tasks to read secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.app.arn
        ]
      }
    ]
  })
}
