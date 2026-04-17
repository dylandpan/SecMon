# sast-lambda.tf
# SAST Lambda — zipped Node.js function, deployed via S3.
# Triggered by API Gateway on GitHub push webhook events.

# Zip the sast-lambda source directory (no node_modules — zero external deps)
data "archive_file" "sast_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../sast-lambda"
  output_path = "${path.module}/sast-lambda.zip"
}

# Upload zip to the existing S3 bucket (reusing pentest_reports bucket)
resource "aws_s3_object" "sast_lambda_zip" {
  bucket = aws_s3_bucket.pentest_reports.id
  key    = "lambda/sast-lambda.zip"
  source = data.archive_file.sast_lambda.output_path
  etag   = data.archive_file.sast_lambda.output_base64sha256
}

resource "aws_lambda_function" "sast_scanner" {
  function_name = "${var.project_name}-sast-scanner"
  role          = var.lab_role_arn
  runtime       = "nodejs20.x"
  handler       = "handler.handler"
  timeout       = 60
  memory_size   = 256

  s3_bucket        = aws_s3_bucket.pentest_reports.id
  s3_key           = aws_s3_object.sast_lambda_zip.key
  source_code_hash = data.archive_file.sast_lambda.output_base64sha256

  environment {
    variables = {
      BACKEND_URL           = "http://${aws_instance.backend.public_ip}:3000"
      GITHUB_WEBHOOK_SECRET = var.github_webhook_secret
      GITHUB_TOKEN          = var.github_token
    }
  }

  tags = { Name = "${var.project_name}-sast-scanner" }
}
