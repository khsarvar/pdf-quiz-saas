output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer (for Route53)"
  value       = module.alb.alb_zone_id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.ecs.cluster_name
}

output "web_service_name" {
  description = "Name of the web ECS service"
  value       = module.ecs.web_service_name
}

output "worker_service_name" {
  description = "Name of the worker ECS service"
  value       = module.ecs.worker_service_name
}

output "web_ecr_repository_url" {
  description = "URL of the web ECR repository"
  value       = module.ecr.web_repository_url
}

output "worker_ecr_repository_url" {
  description = "URL of the worker ECR repository"
  value       = module.ecr.worker_repository_url
}

output "rds_endpoint" {
  description = "Endpoint of the RDS instance"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "document_queue_url" {
  description = "URL of the document processing SQS queue"
  value       = module.sqs.document_queue_url
}

output "quiz_queue_url" {
  description = "URL of the quiz generation SQS queue"
  value       = module.sqs.quiz_queue_url
}

output "secrets_arn" {
  description = "ARN of the Secrets Manager secret"
  value       = module.secrets.secrets_arn
}

output "db_password" {
  description = "Generated database password"
  value       = local.db_password
  sensitive   = true
}
