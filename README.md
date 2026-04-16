# SecMon — Quick Start

## Prerequisites

- AWS CLI configured (Learner Lab session active)
- Docker running
- Terraform installed
- Node.js 20+

## Deploy

```bash
# 1. Set your LabRole ARN
cd terraform
echo 'lab_role_arn = "arn:aws:iam::<YOUR_ACCOUNT_ID>:role/LabRole"' > terraform.tfvars

# 2. Deploy everything (VPC, DynamoDB, S3, SQS, ECR, Lambda, EC2)
cd ..
./deploy.sh
# Note the Backend API URL in the output (e.g. http://<EC2_IP>:3000)

# 3. Deploy the vulnerable test target (separate EC2 on port 4000)
./deploy-pentest-target.sh
# Note the test target URL (e.g. http://<TARGET_IP>:4000)
```

## Run frontend locally

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

The Vite proxy in `vite.config.js` forwards `/api/*` to the EC2 backend. Update the `target` URL there if your EC2 IP changes.

## Tear down

```bash
cd terraform && terraform destroy -auto-approve
aws ec2 terminate-instances --instance-ids <TARGET_INSTANCE_ID> --region us-west-2
```

## Project structure

```
frontend/          React app (Vite)
backend/           Express API (runs on EC2)
pentest-lambda/    Lambda handler + scanner (Docker, deployed to ECR)
terraform/         All AWS infrastructure (single root)
deploy.sh          One-command deploy
```

See [PROGRESS.md](PROGRESS.md) for full merge details and design decisions.
