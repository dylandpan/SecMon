# lambda.tf
# Containerized Lambda that consumes pentest jobs from SQS,
# runs tests, writes results to DynamoDB + S3.

resource "aws_lambda_function" "pentest_scanner" {
  function_name = "${var.project_name}-pentest-scanner"
  role          = var.lab_role_arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.pentest_scanner.repository_url}:latest"
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory
  architectures = ["arm64"]

  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.pentest_results.name
      S3_BUCKET      = aws_s3_bucket.pentest_reports.id
    }
  }
}

# SQS triggers Lambda (one message at a time)
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.pentest_jobs.arn
  function_name    = aws_lambda_function.pentest_scanner.arn
  batch_size       = 1
  enabled          = true
}
