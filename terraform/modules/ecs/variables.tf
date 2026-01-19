variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "private_subnets" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "alb_target_group_arn" {
  description = "ARN of the ALB target group"
  type        = string
}

variable "alb_security_group_id" {
  description = "ID of the ALB security group"
  type        = string
}

variable "web_ecr_repository_url" {
  description = "URL of the web ECR repository"
  type        = string
}

variable "worker_ecr_repository_url" {
  description = "URL of the worker ECR repository"
  type        = string
}

variable "web_cpu" {
  description = "CPU units for web service"
  type        = number
}

variable "web_memory" {
  description = "Memory for web service in MiB"
  type        = number
}

variable "web_desired_count" {
  description = "Desired number of web tasks"
  type        = number
}

variable "worker_cpu" {
  description = "CPU units for worker service"
  type        = number
}

variable "worker_memory" {
  description = "Memory for worker service in MiB"
  type        = number
}

variable "worker_desired_count" {
  description = "Desired number of worker tasks"
  type        = number
}

variable "secrets_arn" {
  description = "ARN of the Secrets Manager secret"
  type        = string
}

variable "database_url" {
  description = "Database connection URL"
  type        = string
  sensitive   = true
}

variable "document_queue_url" {
  description = "URL of the document processing SQS queue"
  type        = string
}

variable "quiz_queue_url" {
  description = "URL of the quiz generation SQS queue"
  type        = string
}

variable "sqs_policy_arn" {
  description = "ARN of the SQS IAM policy"
  type        = string
}

variable "rds_security_group_id" {
  description = "ID of the RDS security group"
  type        = string
}
