# sast-lambda.tf
# SAST Lambda — containerized (needs git binary for repo cloning).
# Triggered by API Gateway on GitHub push webhook events.
# Writes scan results directly to the secmon-scans DynamoDB table.

resource "aws_ecr_repository" "sast_scanner" {
  name         = "${var.project_name}-sast-scanner"
  force_delete = true

  tags = { Name = "${var.project_name}-sast-scanner" }
}

resource "aws_lambda_function" "sast_scanner" {
  function_name = "${var.project_name}-sast-scanner"
  role          = var.lab_role_arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.sast_scanner.repository_url}:latest"
  timeout       = 300      # 5 min — clone + scan of a medium repo
  memory_size   = 1024
  architectures = ["arm64"]

  ephemeral_storage {
    size = 2048            # 2 GB /tmp for cloning larger repos
  }

  environment {
    variables = {
      REPORT_BUCKET         = aws_s3_bucket.pentest_reports.id
      SCAN_RESULTS_TABLE    = aws_dynamodb_table.scans.name
      TABLE_REPOS           = aws_dynamodb_table.repos.name
      GITHUB_WEBHOOK_SECRET = var.github_webhook_secret
    }
  }

  tags = { Name = "${var.project_name}-sast-scanner" }
}
