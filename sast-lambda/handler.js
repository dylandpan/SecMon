import { execFileSync } from "child_process";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import { scanDirectory } from "./scanner.js";

const REGION = process.env.AWS_REGION || "us-west-2";
const s3     = new S3Client({ region: REGION });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const REPORT_BUCKET       = process.env.REPORT_BUCKET        || "secmon-pentest-reports";
const SCAN_RESULTS_TABLE  = process.env.SCAN_RESULTS_TABLE   || "secmon-scans";
const WEBHOOK_SECRET      = process.env.GITHUB_WEBHOOK_SECRET;

// HMAC-SHA256 verification using timing-safe comparison to prevent timing attacks
function verifyGitHubSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) {
    console.warn("GITHUB_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const receivedSig = Buffer.from(signatureHeader.slice(7), "hex");
  const expectedSig = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest();

  if (receivedSig.length !== expectedSig.length) return false;
  return timingSafeEqual(receivedSig, expectedSig);
}

// Allow only github.com HTTPS URLs — prevents SSRF to internal AWS metadata etc.
function validateRepoUrl(url) {
  return /^https:\/\/github\.com\/[\w.-]{1,100}\/[\w.-]{1,100}(\.git)?$/.test(url);
}

// Branch names: alphanumeric plus / . - _ (no shell metacharacters)
function validateBranch(branch) {
  return /^[\w./\-]{1,255}$/.test(branch);
}

// Repo name used as a directory component — strip non-alphanumeric chars
function sanitizeRepoName(name) {
  return name.replace(/[^\w.-]/g, "_").slice(0, 100);
}

export const lambdaHandler = async (event) => {
  const rawBody   = event.body || "";
  const signature = event.headers?.["x-hub-signature-256"]
                 || event.headers?.["X-Hub-Signature-256"];

  if (!verifyGitHubSignature(rawBody, signature)) {
    console.error("Webhook signature verification failed");
    return resp(401, { error: "Invalid webhook signature" });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return resp(400, { error: "Invalid JSON payload" });
  }

  // Only process push events that have commits (ignore branch deletions)
  if (!body?.repository || !body?.after || body.after === "0000000000000000000000000000000000000000") {
    return resp(200, { message: "Event ignored (not a push with commits)" });
  }

  const repoUrl    = body.repository.clone_url;
  const repoId     = body.repository.full_name;          // e.g. "YueHuang22/sast-test-repo"
  const repoName   = sanitizeRepoName(body.repository.name || "unknown");
  const branch     = (body.ref || "refs/heads/main").split("/").slice(2).join("/");
  const commitSha  = body.after.substring(0, 7);

  if (!repoUrl || !validateRepoUrl(repoUrl)) {
    return resp(400, { error: "Missing or invalid repository URL" });
  }
  if (!validateBranch(branch)) {
    return resp(400, { error: "Invalid branch name" });
  }

  console.log(`Scanning repo: ${repoId}, branch: ${branch}, commit: ${commitSha}`);

  // Clone into /tmp — Lambda ephemeral storage, unique per invocation
  const cloneDir = `/tmp/${repoName}-${commitSha}`;
  if (fs.existsSync(cloneDir)) {
    fs.rmSync(cloneDir, { recursive: true });
  }

  try {
    // execFileSync does NOT invoke a shell, so no command injection is possible
    execFileSync("git", ["clone", "--depth", "1", "--branch", branch, repoUrl, cloneDir], {
      timeout: 60_000,
      stdio: "pipe",
    });
    console.log("Clone successful");
  } catch (e) {
    console.error("Git clone failed:", e.stderr?.toString());
    return resp(500, { error: "Failed to clone repo", details: e.stderr?.toString() });
  }

  let scanResults;
  try {
    scanResults = scanDirectory(cloneDir);
    console.log(`Scan complete. Files with findings: ${Object.keys(scanResults).length}`);
  } catch (e) {
    console.error("Scan failed:", e.message);
    return resp(500, { error: "SAST scan failed", details: e.message });
  } finally {
    // Always clean up the clone to avoid filling ephemeral storage
    if (fs.existsSync(cloneDir)) {
      fs.rmSync(cloneDir, { recursive: true });
    }
  }

  // Flatten per-file results into a single array; normalise severity to lowercase
  const allVulns = Object.values(scanResults).flat().map(v => ({
    type:     v.id,
    severity: v.severity.toLowerCase(),   // frontend expects lowercase: "high" / "medium" / "low"
    message:  v.message,
    file:     v.file.replace(cloneDir + "/", ""), // strip /tmp prefix
    line:     v.line,
  }));

  const high   = allVulns.filter(v => v.severity === "high").length;
  const medium = allVulns.filter(v => v.severity === "medium").length;
  const low    = allVulns.filter(v => v.severity === "low").length;
  const status = high > 0 ? "FAIL" : medium > 0 ? "WARN" : "PASS";

  const scannedAt = new Date().toISOString();
  const scanId    = randomUUID();

  // Upload full report to S3
  const s3Key = `sast-reports/${repoName}/${scannedAt.replace(/[:.]/g, "-")}_${commitSha}.json`;
  const report = {
    scanId, repoId, branch, commit: commitSha, scannedAt,
    summary: { high, medium, low, total: allVulns.length },
    vulnerabilities: allVulns,
  };

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      REPORT_BUCKET,
      Key:         s3Key,
      Body:        JSON.stringify(report, null, 2),
      ContentType: "application/json",
    }));
    console.log(`Report uploaded to s3://${REPORT_BUCKET}/${s3Key}`);
  } catch (e) {
    console.error("S3 upload failed:", e.message);
    return resp(500, { error: "Failed to upload report", details: e.message });
  }

  // Write scan summary to DynamoDB — matches secmon-scans table schema
  // (scanId PK, repoId-timestamp-index GSI) so the backend + SASTPage can read it
  try {
    await dynamo.send(new PutCommand({
      TableName: SCAN_RESULTS_TABLE,
      Item: {
        scanId,
        repoId,
        branch,
        timestamp:       scannedAt,
        status,
        high,
        medium,
        low,
        vulnerabilities: allVulns,
        reportUrl:       `s3://${REPORT_BUCKET}/${s3Key}`,
      },
    }));
    console.log(`Scan metadata written to DynamoDB: ${SCAN_RESULTS_TABLE}`);
  } catch (e) {
    // DynamoDB failure is non-fatal — full report is already in S3
    console.error("DynamoDB write failed (report still saved to S3):", e.message);
  }

  console.log(`Scan complete: ${high}H ${medium}M ${low}L → ${status}`);
  return resp(200, {
    message: "SAST scan completed",
    repoId, branch, commit: commitSha, status, high, medium, low,
    reportLocation: `s3://${REPORT_BUCKET}/${s3Key}`,
  });
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
