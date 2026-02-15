output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = var.enabled ? aws_lb.main[0].arn : null
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = var.enabled ? aws_lb.main[0].dns_name : null
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = var.enabled ? aws_lb.main[0].zone_id : null
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = var.enabled ? aws_lb_target_group.web[0].arn : null
}

output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = var.enabled ? aws_security_group.alb[0].id : null
}
