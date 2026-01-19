# Production Environment Configuration
# Copy this file and fill in the values for your environment

aws_region   = "us-east-1"
project_name = "saas-starter"
environment  = "production"

# VPC Configuration
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]

# RDS Configuration
db_instance_class = "db.t3.medium"
db_name           = "saas_starter"
db_username       = "postgres"
db_multi_az       = true

# ECS Configuration
web_cpu           = 512
web_memory        = 1024
web_desired_count = 2

worker_cpu           = 512
worker_memory        = 1024
worker_desired_count = 1

# Domain Configuration (update with your domain)
# domain_name         = "app.example.com"
# acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/xxx"

# Application Secrets (provide via environment variables or separate secrets file)
# These should NOT be committed to version control
# stripe_secret_key     = ""
# stripe_webhook_secret = ""
# openai_api_key        = ""
# r2_account_id         = ""
# r2_access_key_id      = ""
# r2_secret_access_key  = ""
# r2_bucket_name        = ""
# jwt_secret            = ""
