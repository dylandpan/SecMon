# ecr.tf
# Hosts the Docker image for the pentest Lambda function.

resource "aws_ecr_repository" "pentest_scanner" {
  name         = "${var.project_name}-pentest-scanner"
  force_delete = true

  image_scanning_configuration {
    scan_on_push = false
  }
}
