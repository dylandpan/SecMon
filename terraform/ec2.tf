# ec2.tf
# The always-on backend server that runs the Express API.
# Code is uploaded to S3, then pulled by EC2 user_data on boot.

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# Upload backend files to S3 so EC2 can pull them
resource "aws_s3_object" "backend_server" {
  bucket       = aws_s3_bucket.pentest_reports.id
  key          = "backend/server.js"
  source       = "${path.module}/../backend/server.js"
  source_hash  = filemd5("${path.module}/../backend/server.js")
  content_type = "application/javascript"
}

resource "aws_s3_object" "backend_package" {
  bucket       = aws_s3_bucket.pentest_reports.id
  key          = "backend/package.json"
  source       = "${path.module}/../backend/package.json"
  source_hash  = filemd5("${path.module}/../backend/package.json")
  content_type = "application/json"
}

resource "aws_instance" "backend" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = "t2.micro"
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.ec2_backend.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true
  key_name                    = "pentest-key"

  # Force replacement when server.js changes
  user_data_replace_on_change = true

  user_data = <<-USERDATA
    #!/bin/bash
    set -ex

    # Install Node.js 20
    yum update -y
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs

    # Pull backend code from S3
    mkdir -p /app/backend
    cd /app/backend
    aws s3 cp s3://${aws_s3_bucket.pentest_reports.id}/backend/server.js .
    aws s3 cp s3://${aws_s3_bucket.pentest_reports.id}/backend/package.json .
    npm install

    # Write env vars
    cat > /etc/profile.d/secmon.sh <<'ENV'
    export PORT=3000
    export AWS_REGION=${var.aws_region}
    export TABLE_SCANS=${aws_dynamodb_table.scans.name}
    export TABLE_PENTEST=${aws_dynamodb_table.pentest_results.name}
    export TABLE_REPOS=${aws_dynamodb_table.repos.name}
    export TABLE_SCHEDULES=${aws_dynamodb_table.schedules.name}
    export SQS_QUEUE_URL=${aws_sqs_queue.pentest_jobs.url}
    export SQS_QUEUE_ARN=${aws_sqs_queue.pentest_jobs.arn}
    export S3_BUCKET=${aws_s3_bucket.pentest_reports.id}
    export WEBHOOK_URL=${aws_apigatewayv2_api.sast_webhook.api_endpoint}/webhook
    ENV
    source /etc/profile.d/secmon.sh

    # Run as systemd service
    cat > /etc/systemd/system/secmon-backend.service <<'SVC'
    [Unit]
    Description=SecMon Backend API
    After=network.target

    [Service]
    Type=simple
    WorkingDirectory=/app/backend
    EnvironmentFile=-/etc/profile.d/secmon.sh
    ExecStart=/usr/bin/node /app/backend/server.js
    Restart=always
    Environment=PORT=3000
    Environment=AWS_REGION=${var.aws_region}
    Environment=TABLE_SCANS=${aws_dynamodb_table.scans.name}
    Environment=TABLE_PENTEST=${aws_dynamodb_table.pentest_results.name}
    Environment=TABLE_REPOS=${aws_dynamodb_table.repos.name}
    Environment=TABLE_SCHEDULES=${aws_dynamodb_table.schedules.name}
    Environment=SQS_QUEUE_URL=${aws_sqs_queue.pentest_jobs.url}
    Environment=SQS_QUEUE_ARN=${aws_sqs_queue.pentest_jobs.arn}
    Environment=S3_BUCKET=${aws_s3_bucket.pentest_reports.id}
    Environment=WEBHOOK_URL=${aws_apigatewayv2_api.sast_webhook.api_endpoint}/webhook

    [Install]
    WantedBy=multi-user.target
    SVC

    systemctl daemon-reload
    systemctl enable secmon-backend
    systemctl start secmon-backend
  USERDATA

  tags = {
    Name = "${var.project_name}-backend"
  }

  depends_on = [aws_s3_object.backend_server, aws_s3_object.backend_package]
}
