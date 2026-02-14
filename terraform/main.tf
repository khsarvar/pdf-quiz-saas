# VPC Module

module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

# ECR Module - Container registries for web and worker
module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
  enable_web   = var.enable_web_stack
}

# Secrets Manager Module
module "secrets" {
  source = "./modules/secrets"

  project_name          = var.project_name
  environment           = var.environment
  db_password           = local.db_password
  stripe_secret_key     = var.stripe_secret_key
  stripe_webhook_secret = var.stripe_webhook_secret
  openai_api_key        = var.openai_api_key
  r2_account_id         = var.r2_account_id
  r2_access_key_id      = var.r2_access_key_id
  r2_secret_access_key  = var.r2_secret_access_key
  r2_bucket_name        = var.r2_bucket_name
  jwt_secret            = var.jwt_secret
}

# Generate random password for database
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

locals {
  db_password = var.db_password != "" ? var.db_password : random_password.db_password.result
}

# RDS Module
module "rds" {
  count  = var.enable_rds ? 1 : 0
  source = "./modules/rds"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  database_subnets   = module.vpc.database_subnet_ids
  private_subnets    = module.vpc.private_subnet_ids
  db_instance_class  = var.db_instance_class
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = local.db_password
  db_multi_az        = var.db_multi_az
  ecs_security_group = module.ecs.ecs_security_group_id
}

moved {
  from = module.rds.aws_security_group.rds
  to   = module.rds[0].aws_security_group.rds
}

moved {
  from = module.rds.aws_db_subnet_group.main
  to   = module.rds[0].aws_db_subnet_group.main
}

moved {
  from = module.rds.aws_db_parameter_group.main
  to   = module.rds[0].aws_db_parameter_group.main
}

moved {
  from = module.rds.aws_db_instance.main
  to   = module.rds[0].aws_db_instance.main
}

moved {
  from = module.rds.aws_iam_role.rds_monitoring
  to   = module.rds[0].aws_iam_role.rds_monitoring
}

moved {
  from = module.rds.aws_iam_role_policy_attachment.rds_monitoring
  to   = module.rds[0].aws_iam_role_policy_attachment.rds_monitoring
}

# SQS Module
module "sqs" {
  source = "./modules/sqs"

  project_name = var.project_name
  environment  = var.environment
}

# ALB Module
module "alb" {
  source = "./modules/alb"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  public_subnets      = module.vpc.public_subnet_ids
  acm_certificate_arn = var.acm_certificate_arn
  enabled             = var.enable_web_stack
}

# ECS Module
module "ecs" {
  source = "./modules/ecs"

  project_name          = var.project_name
  environment           = var.environment
  aws_region            = var.aws_region
  vpc_id                = module.vpc.vpc_id
  private_subnets       = module.vpc.private_subnet_ids
  alb_target_group_arn  = module.alb.target_group_arn
  alb_security_group_id = module.alb.alb_security_group_id
  enable_web            = var.enable_web_stack

  # ECR repositories
  web_ecr_repository_url    = module.ecr.web_repository_url
  worker_ecr_repository_url = module.ecr.worker_repository_url

  # Web service configuration
  web_cpu           = var.web_cpu
  web_memory        = var.web_memory
  web_desired_count = var.web_desired_count

  # Worker service configuration
  worker_cpu           = var.worker_cpu
  worker_memory        = var.worker_memory
  worker_desired_count = var.worker_desired_count

  # Secrets
  secrets_arn = module.secrets.secrets_arn

  # Database
  database_url = var.postgres_url

  # SQS
  document_queue_url = module.sqs.document_queue_url
  quiz_queue_url     = module.sqs.quiz_queue_url
  sqs_policy_arn     = module.sqs.sqs_policy_arn
}
