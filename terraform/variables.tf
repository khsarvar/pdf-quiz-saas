variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "saas-starter"
}

variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-2a", "us-east-2b"]
}

# RDS Configuration
variable "enable_rds" {
  description = "Whether to create RDS resources"
  type        = bool
  default     = true
}

variable "enable_web_stack" {
  description = "Whether to create web-facing AWS resources (ALB + ECS web + web ECR)"
  type        = bool
  default     = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "Name of the database"
  type        = string
  default     = "saas_starter"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "postgres"
  sensitive   = true
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = true
}

variable "db_password" {
  description = "Database master password (optional override)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "postgres_url" {
  description = "PostgreSQL connection URL used by ECS tasks (e.g. Supabase connection string)"
  type        = string
  sensitive   = true
  default     = ""
}

# ECS Configuration
variable "web_cpu" {
  description = "CPU units for web service (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memory for web service in MiB"
  type        = number
  default     = 1024
}

variable "web_desired_count" {
  description = "Desired number of web tasks"
  type        = number
  default     = 2
}

variable "worker_cpu" {
  description = "CPU units for worker service"
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Memory for worker service in MiB"
  type        = number
  default     = 1024
}

variable "worker_desired_count" {
  description = "Desired number of worker tasks"
  type        = number
  default     = 1
}

# Domain Configuration
variable "domain_name" {
  description = "Domain name for the application (e.g., app.example.com)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS"
  type        = string
  default     = ""
}

# Application Secrets (will be stored in Secrets Manager)
variable "stripe_secret_key" {
  description = "Stripe secret key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "r2_account_id" {
  description = "Cloudflare R2 account ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "r2_access_key_id" {
  description = "Cloudflare R2 access key ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "r2_secret_access_key" {
  description = "Cloudflare R2 secret access key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "r2_bucket_name" {
  description = "Cloudflare R2 bucket name"
  type        = string
  default     = ""
}

variable "jwt_secret" {
  description = "JWT secret for authentication"
  type        = string
  sensitive   = true
  default     = ""
}
