#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"
LAMBDA_DIR="$SCRIPT_DIR/pentest-lambda"
SAST_LAMBDA_DIR="$SCRIPT_DIR/sast-lambda"

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
  -target=aws_ecr_repository.sast_scanner \
  -target=aws_s3_bucket.pentest_reports \
  -target=aws_dynamodb_table.scans \
  -target=aws_dynamodb_table.pentest_results \
  -target=aws_dynamodb_table.repos \
  -target=aws_dynamodb_table.schedules \
  -target=aws_sqs_queue.pentest_jobs \
  -target=aws_sqs_queue_policy.allow_eventbridge

# ─── Step 2: Get ECR repo URLs from Terraform output ────────────
ECR_REPO=$(terraform output -raw ecr_repository_url)
SAST_ECR_REPO=$(terraform output -raw sast_ecr_repository_url)
echo ""
echo ">>> Step 2: Pentest ECR = $ECR_REPO"
echo "            SAST ECR    = $SAST_ECR_REPO"

# ─── Step 3: Docker login to ECR ────────────────────────────────
echo ""
echo ">>> Step 3: Docker login to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# ─── Step 4: Build and push pentest container image ─────────────
echo ""
echo ">>> Step 4: Build + push pentest Docker image"
cd "$LAMBDA_DIR"
docker build --provenance=false --platform linux/arm64 -t secmon-pentest-scanner .
docker tag secmon-pentest-scanner:latest "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"

# ─── Step 4b: Build and push SAST container image ────────────────
echo ""
echo ">>> Step 4b: Build + push SAST Docker image"
cd "$SAST_LAMBDA_DIR"
docker build --provenance=false --platform linux/arm64 -t secmon-sast-scanner .
docker tag secmon-sast-scanner:latest "$SAST_ECR_REPO:latest"
docker push "$SAST_ECR_REPO:latest"

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
SAST_WEBHOOK=$(terraform output -raw sast_webhook_url)
echo "Backend API:   http://$EC2_IP:3000"
echo "SQS Queue:     $SQS_URL"
echo "SAST Webhook:  $SAST_WEBHOOK"
echo ""
echo "Next steps:"
echo "  1. Add webhook to GitHub repo:"
echo "     URL:          $SAST_WEBHOOK"
echo "     Content-type: application/json"
echo "     Event:        Just the push event"
echo ""
echo "  2. To test pentest manually:"
cat <<EOF
  curl -X POST http://$EC2_IP:3000/api/pentests/scan \\
    -H "Content-Type: application/json" \\
    -d '{"targetUrl": "YOUR_TARGET_URL"}'
EOF
