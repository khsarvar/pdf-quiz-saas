output "document_queue_url" {
  description = "URL of the document processing queue"
  value       = aws_sqs_queue.document.url
}

output "document_queue_arn" {
  description = "ARN of the document processing queue"
  value       = aws_sqs_queue.document.arn
}

output "quiz_queue_url" {
  description = "URL of the quiz generation queue"
  value       = aws_sqs_queue.quiz.url
}

output "quiz_queue_arn" {
  description = "ARN of the quiz generation queue"
  value       = aws_sqs_queue.quiz.arn
}

output "document_dlq_arn" {
  description = "ARN of the document processing DLQ"
  value       = aws_sqs_queue.document_dlq.arn
}

output "quiz_dlq_arn" {
  description = "ARN of the quiz generation DLQ"
  value       = aws_sqs_queue.quiz_dlq.arn
}

output "sqs_policy_arn" {
  description = "ARN of the SQS IAM policy"
  value       = aws_iam_policy.sqs.arn
}
