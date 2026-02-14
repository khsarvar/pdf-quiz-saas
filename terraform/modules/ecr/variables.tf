variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "enable_web" {
  description = "Whether to create web ECR resources"
  type        = bool
  default     = true
}
