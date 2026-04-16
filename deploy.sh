#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"
LAMBDA_DIR="$SCRIPT_DIR/pentest-lambda"

AWS_REGION=$(grep 'aws_region' "$TF_DIR/terraform.tfvars" 2>/dev/null | cut -d'"' -f2 || echo "us-west-2")
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "=== SecMon Full Deploy ==="
echo "Account: $AWS_ACCOUNT_ID"
echo "Region:  $AWS_REGION"
echo ""

# ─── Step 1: Terraform apply (infra only, skip Lambda + EC2) ────
# Lambda needs a Docker image in ECR first.
# EC2 depends on SQS/S3/DynamoDB outputs for env vars.
echo ">>> Step 1: Terraform init + apply (infra only)"
cd "$TF_DIR"
terraform init -input=false
terraform apply -auto-approve \
  -target=aws_vpc.main \
  -target=aws_subnet.public \
  -target=aws_subnet.private \
  -target=aws_internet_gateway.main \
  -target=aws_route_table.public \
  -target=aws_route_table_association.public \
  -target=aws_route_table.private \
  -target=aws_route_table_association.private \
  -target=aws_security_group.ec2_backend \
  -target=aws_security_group.lambda \
  -target=aws_iam_instance_profile.ec2 \
  -target=aws_ecr_repository.pentest_scanner \
  -target=aws_s3_bucket.pentest_reports \
  -target=aws_dynamodb_table.scans \
  -target=aws_dynamodb_table.pentest_results \
  -target=aws_dynamodb_table.repos \
  -target=aws_dynamodb_table.schedules \
  -target=aws_sqs_queue.pentest_jobs \
  -target=aws_sqs_queue_policy.allow_eventbridge

# ─── Step 2: Get ECR repo URL from Terraform output ─────────────
ECR_REPO=$(terraform output -raw ecr_repository_url)
echo ""
echo ">>> Step 2: ECR repo = $ECR_REPO"

# ─── Step 3: Docker login to ECR ────────────────────────────────
echo ""
echo ">>> Step 3: Docker login to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# ─── Step 4: Build and push container image ──────────────────────
echo ""
echo ">>> Step 4: Build + push Docker image"
cd "$LAMBDA_DIR"
docker build --provenance=false -t secmon-pentest-scanner .
docker tag secmon-pentest-scanner:latest "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"

# ─── Step 5: Full Terraform apply (Lambda + EC2 now have deps) ──
echo ""
echo ">>> Step 5: Terraform apply (full — creates Lambda + EC2)"
cd "$TF_DIR"
terraform apply -auto-approve

# ─── Step 6: Print summary ──────────────────────────────────────
echo ""
echo "=== Deploy Complete ==="
echo ""
terraform output
echo ""
EC2_IP=$(terraform output -raw ec2_public_ip)
SQS_URL=$(terraform output -raw sqs_queue_url)
echo "Backend API:  http://$EC2_IP:3000"
echo "SQS Queue:    $SQS_URL"
echo ""
echo "To test manually:"
cat <<EOF
  curl -X POST http://$EC2_IP:3000/api/pentests/scan \\
    -H "Content-Type: application/json" \\
    -d '{"targetUrl": "YOUR_TARGET_URL"}'
EOF
