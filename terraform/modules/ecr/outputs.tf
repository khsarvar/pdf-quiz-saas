output "web_repository_url" {
  description = "URL of the web ECR repository"
  value       = var.enable_web ? aws_ecr_repository.web[0].repository_url : null
}

output "worker_repository_url" {
  description = "URL of the worker ECR repository"
  value       = aws_ecr_repository.worker.repository_url
}

output "web_repository_arn" {
  description = "ARN of the web ECR repository"
  value       = var.enable_web ? aws_ecr_repository.web[0].arn : null
}

output "worker_repository_arn" {
  description = "ARN of the worker ECR repository"
  value       = aws_ecr_repository.worker.arn
}
