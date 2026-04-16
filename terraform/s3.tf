# s3.tf
# Stores full JSON pentest reports written by Lambda.

resource "aws_s3_bucket" "pentest_reports" {
  bucket        = "${var.project_name}-pentest-reports"
  force_destroy = true
}
