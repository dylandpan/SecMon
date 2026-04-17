# outputs.tf

# ── Networking ───────────────────────────────────────────────────────────────
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "Public subnet — where EC2 backend lives"
  value       = aws_subnet.public.id
}

output "private_subnet_id" {
  description = "Private subnet"
  value       = aws_subnet.private.id
}

output "ec2_backend_sg_id" {
  description = "Security group ID for the EC2 backend"
  value       = aws_security_group.ec2_backend.id
}

output "lambda_sg_id" {
  description = "Security group ID for Lambda functions"
  value       = aws_security_group.lambda.id
}

# ── IAM ──────────────────────────────────────────────────────────────────────
output "lab_role_arn" {
  description = "LabRole ARN"
  value       = data.aws_iam_role.lab_role.arn
}

output "ec2_instance_profile_name" {
  description = "Instance profile name for EC2"
  value       = aws_iam_instance_profile.ec2.name
}

# ── EC2 ──────────────────────────────────────────────────────────────────────
output "ec2_public_ip" {
  description = "Public IP of the backend EC2 — use as VITE_API_URL"
  value       = aws_instance.backend.public_ip
}

output "ec2_public_dns" {
  description = "Public DNS of the backend EC2"
  value       = aws_instance.backend.public_dns
}

# ── Pentest Pipeline ────────────────────────────────────────────────────────
output "sqs_queue_url" {
  description = "SQS queue URL — backend sends manual scan jobs here"
  value       = aws_sqs_queue.pentest_jobs.url
}

output "sqs_queue_arn" {
  description = "SQS queue ARN — used by EventBridge targets"
  value       = aws_sqs_queue.pentest_jobs.arn
}

output "s3_bucket_name" {
  description = "S3 bucket for pentest reports"
  value       = aws_s3_bucket.pentest_reports.id
}

output "ecr_repository_url" {
  description = "ECR repository URL — push Lambda Docker image here"
  value       = aws_ecr_repository.pentest_scanner.repository_url
}

output "lambda_function_name" {
  description = "Pentest Lambda function name"
  value       = aws_lambda_function.pentest_scanner.function_name
}

# ── SAST Pipeline ────────────────────────────────────────────────────────────
output "sast_webhook_url" {
  description = "GitHub webhook URL — add in repo Settings → Webhooks (Content type: application/json, event: push)"
  value       = "${aws_apigatewayv2_api.sast_webhook.api_endpoint}/webhook"
}

output "sast_lambda_function_name" {
  description = "SAST Lambda function name"
  value       = aws_lambda_function.sast_scanner.function_name
}

output "sast_ecr_repository_url" {
  description = "ECR repository URL — push SAST Lambda Docker image here before terraform apply"
  value       = aws_ecr_repository.sast_scanner.repository_url
}
