# sqs.tf
# Buffers pentest scan jobs from the Backend API (manual) and EventBridge (scheduled).

resource "aws_sqs_queue" "pentest_jobs" {
  name                       = "${var.project_name}-pentest-jobs"
  visibility_timeout_seconds = var.lambda_timeout * 6
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 10    # long polling
}

# Allow any EventBridge rule in this account to send messages to this queue.
# The backend creates rules dynamically via POST /api/schedules.
data "aws_caller_identity" "current" {}

resource "aws_sqs_queue_policy" "allow_eventbridge" {
  queue_url = aws_sqs_queue.pentest_jobs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.pentest_jobs.arn
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}
