# ECR Repository for Web Service
resource "aws_ecr_repository" "web" {
  count                = var.enable_web ? 1 : 0
  name                 = "${var.project_name}-${var.environment}-web"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-web"
  }
}

# ECR Repository for Worker Service
resource "aws_ecr_repository" "worker" {
  name                 = "${var.project_name}-${var.environment}-worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-worker"
  }
}

# Lifecycle policy to clean up old images
resource "aws_ecr_lifecycle_policy" "web" {
  count      = var.enable_web ? 1 : 0
  repository = aws_ecr_repository.web[0].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

moved {
  from = aws_ecr_repository.web
  to   = aws_ecr_repository.web[0]
}

moved {
  from = aws_ecr_lifecycle_policy.web
  to   = aws_ecr_lifecycle_policy.web[0]
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
