# Dead Letter Queue for Document Processing
resource "aws_sqs_queue" "document_dlq" {
  name                      = "${var.project_name}-${var.environment}-document-dlq.fifo"
  fifo_queue                = true
  content_based_deduplication = true
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${var.project_name}-${var.environment}-document-dlq"
  }
}

# Document Processing Queue
resource "aws_sqs_queue" "document" {
  name                       = "${var.project_name}-${var.environment}-document-processing.fifo"
  fifo_queue                 = true
  content_based_deduplication = true
  visibility_timeout_seconds = 900 # 15 minutes (for long processing)
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 20 # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.document_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-document-processing"
  }
}

# Dead Letter Queue for Quiz Generation
resource "aws_sqs_queue" "quiz_dlq" {
  name                      = "${var.project_name}-${var.environment}-quiz-dlq.fifo"
  fifo_queue                = true
  content_based_deduplication = true
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${var.project_name}-${var.environment}-quiz-dlq"
  }
}

# Quiz Generation Queue
resource "aws_sqs_queue" "quiz" {
  name                       = "${var.project_name}-${var.environment}-quiz-generation.fifo"
  fifo_queue                 = true
  content_based_deduplication = true
  visibility_timeout_seconds = 600 # 10 minutes
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 20 # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.quiz_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-quiz-generation"
  }
}

# IAM Policy for SQS Access
resource "aws_iam_policy" "sqs" {
  name        = "${var.project_name}-${var.environment}-sqs-policy"
  description = "Policy for ECS tasks to access SQS queues"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueUrl",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = [
          aws_sqs_queue.document.arn,
          aws_sqs_queue.quiz.arn,
          aws_sqs_queue.document_dlq.arn,
          aws_sqs_queue.quiz_dlq.arn
        ]
      }
    ]
  })
}
