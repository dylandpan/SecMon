# SecMon — Merge Progress Report

**Date:** April 15–16, 2026
**Status:** Merged, deployed, and validated end-to-end

---

## What was accomplished

Merged two independently-built components into a single deployable project:

- **Pentest pipeline** (DP): EventBridge → SQS → Lambda (containerized) → DynamoDB + S3
- **CodeSafe** (teammate): React frontend + Express backend on EC2 + DynamoDB tables + VPC

### Key decisions made during merge

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Terraform | Single root, one `terraform apply` | Simpler for class project, no cross-referencing |
| DynamoDB schema | Teammate's: 1 row per test (PK=`jobId`, SK=`testName`) | Matches backend query patterns |
| Project prefix | `secmon` (all resources: `secmon-*`) | Unified naming |
| Region | `us-west-2` everywhere | Consistent across all components |
| Scheduling | Fully dynamic via `/api/schedules` | Users configure from UI, no fixed Terraform rules |
| `POST /api/pentests` | Removed | Lambda writes directly to DynamoDB, endpoint was redundant |
| Test IDs | Scanner's actual IDs: `auth, sqli, nosqli, rate-limit, headers, data-exposure` | These are what tester.js actually supports |

---

## Merged directory structure

```
SecMon/
├── frontend/                  React app (Vite)
│   ├── src/App.jsx            3-tab navigation (SAST, PenTest, GitHub)
│   ├── src/api/client.js      Centralized API client
│   └── src/pages/
│       ├── SASTPage.jsx       Scan list + detail view
│       ├── PenTestPage.jsx    Manual scans, scheduled scans, scan detail
│       └── GitHubPage.jsx     Webhook URL, repo registration
├── backend/
│   ├── server.js              Express API (DynamoDB, SQS, S3, EventBridge)
│   └── package.json
├── pentest-lambda/
│   ├── handler.js             Lambda SQS handler (rewritten for merged schema)
│   ├── tester.js              Pentest scanner logic (unchanged)
│   ├── Dockerfile             Container image for Lambda
│   └── package.json
├── terraform/                 Single Terraform root (11 files)
│   ├── main.tf                Provider config
│   ├── variables.tf           All variables (networking, Lambda, IAM)
│   ├── networking.tf          VPC, subnets, IGW, route tables
│   ├── security.tf            Security groups (EC2, Lambda)
│   ├── iam.tf                 LabRole lookup + EC2 instance profile
│   ├── dynamodb.tf            4 tables: scans, pentest-results, repos, schedules
│   ├── ec2.tf                 Backend EC2 (pulls code from S3)
│   ├── s3.tf                  Pentest reports bucket
│   ├── sqs.tf                 Pentest jobs queue + EventBridge policy
│   ├── ecr.tf                 Lambda container registry
│   ├── lambda.tf              Pentest scanner Lambda + SQS trigger
│   └── outputs.tf             All resource IDs/URLs/ARNs
├── deploy.sh                  One-command full deploy
├── deploy-pentest-target.sh   Deploy vulnerable test API on EC2
└── PROGRESS.md                This file
```

---

## Integration changes

### 1. Lambda handler rewrite (`pentest-lambda/handler.js`)

**Before:** Wrote 1 DynamoDB row per scan (PK=`scanId`, SK=`createdAt`) to a `PentestScans` table.

**After:** Writes 1 row per test result (PK=`jobId`, SK=`testName`) to the `secmon-pentest-results` table. Each scan produces 6 rows (one per test type). Full JSON report still written to S3.

Also added unique jobId generation per run (`scanId_<suffix>`) so scheduled scans don't overwrite each other in DynamoDB.

### 2. Backend updates (`backend/server.js`)

- **Added `POST /api/pentests/scan`** — triggers a manual scan by sending a job to SQS. Returns `{ jobId, status: "queued" }`.
- **Added `GET /api/pentests/:id/report`** — fetches the full JSON report from S3.
- **Removed `POST /api/pentests`** — Lambda writes directly to DynamoDB, this endpoint was dead code.
- **Implemented EventBridge schedule creation** (`POST /api/schedules`) — creates an EventBridge rule + SQS target dynamically.
- **Implemented EventBridge schedule deletion** (`DELETE /api/schedules/:id`) — removes targets then deletes the rule.
- **Fixed test IDs** — default test list updated from `[sqli, xss, auth, cors, idor, rate-limit]` to `[auth, sqli, nosqli, rate-limit, headers, data-exposure]`.
- **Added AWS SDK clients** — SQS, S3, EventBridge (in addition to existing DynamoDB).
- **Updated table name defaults** — `codesafe-*` → `secmon-*`.

### 3. Terraform merge

Combined CodeSafe's infrastructure (VPC, EC2, DynamoDB, IAM) with the pentest pipeline (S3, SQS, ECR, Lambda) into a single root.

Key changes:
- **Dropped** pentest's `dynamodb.tf` (using teammate's 4-table schema)
- **Dropped** pentest's `eventbridge.tf` (scheduling is fully dynamic via backend API)
- **Updated** `ec2.tf` to pull backend code from S3 instead of cloning from GitHub, added `SQS_QUEUE_URL`, `SQS_QUEUE_ARN`, `S3_BUCKET` env vars, added SSH key, runs as systemd service
- **Updated** `sqs.tf` policy to allow any EventBridge rule in the account (for dynamic schedules)
- **Renamed** all resources from `codesafe-*` to `secmon-*`
- **Changed** region defaults from `us-east-1` to `us-west-2`

### 4. Frontend pages

Built all 3 page components that were missing from the CodeSafe repo:

- **SASTPage** — scan list with status badges and severity counts, click-through to detail view with vulnerability breakdown
- **PenTestPage** — separated into Manual Scans and Scheduled Scans sections. Manual scans can be triggered via New Scan button. Schedules show run counts, clicking a schedule lists its runs, clicking a run shows the 6 test results.
- **GitHubPage** — displays webhook URL, lists registered repos, add repo form

Updated `api/client.js` with new endpoints: `triggerPentest`, `getPentestReport`, `getSchedules`, `createSchedule`, `deleteSchedule`.

Renamed branding from "CodeSafe" to "SecMon" in the sidebar.

---

## End-to-end validation

### Manual scan test
```
POST /api/pentests/scan { targetUrl: "http://<test-target>:4000/api/users" }
→ SQS message queued
→ Lambda picks up, runs 6 tests
→ DynamoDB: 6 rows written (jobId + testName)
→ S3: full JSON report at pentest/<jobId>/<timestamp>.json
→ GET /api/pentests/<jobId> returns all 6 test results
→ Frontend displays results with pass/fail/warn badges
```

### Scheduled scan test
```
POST /api/schedules { targetUrl, cronExpression: "rate(1 minute)" }
→ DynamoDB schedule saved
→ EventBridge rule created with SQS target
→ Every minute: SQS message → Lambda → DynamoDB + S3
→ Each run gets unique jobId, appears as separate entry
→ Frontend groups runs under the schedule card
→ DELETE /api/schedules/:id removes rule + DynamoDB entry
```

### Scan results (test target at http://<ec2>:4000/api/users)

| Test | Result | Finding |
|------|--------|---------|
| Authentication | WARN | Endpoint returns data without auth |
| SQL Injection | PASS | No SQLi detected |
| NoSQL Injection | PASS | No NoSQLi detected |
| Rate Limiting | FAIL | No rate limiting — 20/20 requests succeeded |
| Security Headers | FAIL | 6 missing headers (CSP, HSTS, X-Frame-Options, etc.) |
| Data Exposure | FAIL | 4 issues (passwords, secrets, verbose errors) |

---

## Deployment

### Prerequisites
- AWS CLI configured (Learner Lab session active)
- Docker running
- Terraform installed

### Deploy everything
```bash
# 1. Create terraform.tfvars
cd terraform
echo 'lab_role_arn = "arn:aws:iam::<ACCOUNT_ID>:role/LabRole"' > terraform.tfvars

# 2. Deploy infra + Lambda + EC2
cd ..
./deploy.sh

# 3. Deploy test target (separate EC2)
./deploy-pentest-target.sh

# 4. Run frontend locally
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173, proxied to EC2 backend
```

### Tear down
```bash
cd terraform && terraform destroy -auto-approve
# Terminate test target separately:
aws ec2 terminate-instances --instance-ids <INSTANCE_ID> --region us-west-2
```

---

## Issues resolved during merge

| Issue | Cause | Fix |
|-------|-------|-----|
| DynamoDB schema mismatch | Pentest: 1 row/scan, Backend: 1 row/test | Rewrote Lambda handler to write 1 row per test |
| Table name conflict | `PentestScans` vs `codesafe-pentest-results` | Unified under `secmon-pentest-results` |
| Test ID mismatch | Backend assumed `xss, cors, idor`; scanner has `nosqli, headers, data-exposure` | Used scanner's actual IDs everywhere |
| Region mismatch | Terraform `us-east-1`, server.js `us-west-2` | Standardized on `us-west-2` |
| Project prefix conflict | `secmon` vs `codesafe` | Unified under `secmon` |
| EC2 pulls stale code from GitHub | user_data cloned old repo without SQS/S3 deps | Upload code to S3, EC2 pulls from there |
| No SSH access to EC2 | No key_name in Terraform | Added `pentest-key` to ec2.tf |
| Scheduled scans overwrite DynamoDB | Same jobId every run | Lambda generates unique jobId with timestamp suffix |
| Frontend CORS blocked | Browser blocks localhost → EC2 IP | Added Vite proxy for `/api` routes |
| EventBridge scheduling was TODO | Backend had placeholder comments | Implemented PutRule/PutTargets/RemoveTargets/DeleteRule |
| Fixed EventBridge rule in Terraform | Couldn't change schedule from UI | Removed Terraform rule, fully dynamic via `/api/schedules` |
