// backend/server.js
// Express API wired to DynamoDB, SQS, S3, and EventBridge.
// Run: node server.js
// Requires env vars: AWS_REGION, TABLE_SCANS, TABLE_PENTEST, TABLE_REPOS,
//                    TABLE_SCHEDULES, SQS_QUEUE_URL, SQS_QUEUE_ARN, S3_BUCKET

const express    = require("express");
const cors       = require("cors");
const { DynamoDBClient }         = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient,
        GetCommand, PutCommand, UpdateCommand,
        QueryCommand, ScanCommand,
        DeleteCommand }           = require("@aws-sdk/lib-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { S3Client, GetObjectCommand }     = require("@aws-sdk/client-s3");
const { EventBridgeClient,
        PutRuleCommand, PutTargetsCommand,
        RemoveTargetsCommand, DeleteRuleCommand } = require("@aws-sdk/client-eventbridge");
const { randomUUID }             = require("crypto");

// ── Config ────────────────────────────────────────────────────────────────────
const app    = express();
const PORT   = process.env.PORT ?? 3000;
const REGION = process.env.AWS_REGION ?? "us-west-2";

const TABLES = {
  scans:     process.env.TABLE_SCANS     ?? "secmon-scans",
  pentest:   process.env.TABLE_PENTEST   ?? "secmon-pentest-results",
  repos:     process.env.TABLE_REPOS     ?? "secmon-repos",
  schedules: process.env.TABLE_SCHEDULES ?? "secmon-schedules",
};

const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN;
const S3_BUCKET     = process.env.S3_BUCKET;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const sqs = new SQSClient({ region: REGION });
const s3  = new S3Client({ region: REGION });
const eb  = new EventBridgeClient({ region: REGION });

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Helper ────────────────────────────────────────────────────────────────────
const wrap = fn => (req, res) =>
  fn(req, res).catch(e => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });

// ── SAST ──────────────────────────────────────────────────────────────────────

// GET /api/scans
app.get("/api/scans", wrap(async (req, res) => {
  const { repoId } = req.query;

  if (repoId) {
    const result = await ddb.send(new QueryCommand({
      TableName:                TABLES.scans,
      IndexName:                "repoId-timestamp-index",
      KeyConditionExpression:   "repoId = :r",
      ExpressionAttributeValues: { ":r": repoId },
      ScanIndexForward:         false,
    }));
    return res.json(result.Items);
  }

  const result = await ddb.send(new ScanCommand({ TableName: TABLES.scans }));
  res.json(result.Items);
}));

// GET /api/scans/:id
app.get("/api/scans/:id", wrap(async (req, res) => {
  const result = await ddb.send(new GetCommand({
    TableName: TABLES.scans,
    Key: { scanId: req.params.id },
  }));
  if (!result.Item) return res.status(404).json({ error: "Scan not found" });
  res.json(result.Item);
}));

// POST /api/scans — called by SAST Lambda after scanning a repo
app.post("/api/scans", wrap(async (req, res) => {
  const { repoId, branch, status, high, medium, low,
          vulnerabilities, reportUrl } = req.body;

  const item = {
    scanId:          randomUUID(),
    repoId,
    branch,
    timestamp:       new Date().toISOString(),
    status,
    high:            high    ?? 0,
    medium:          medium  ?? 0,
    low:             low     ?? 0,
    vulnerabilities: vulnerabilities ?? [],
    reportUrl,
  };

  await ddb.send(new PutCommand({ TableName: TABLES.scans, Item: item }));
  res.status(201).json(item);
}));

// ── PenTest ───────────────────────────────────────────────────────────────────

// GET /api/pentests — list all pen test results
app.get("/api/pentests", wrap(async (req, res) => {
  const { targetId } = req.query;

  if (targetId) {
    const result = await ddb.send(new QueryCommand({
      TableName:                 TABLES.pentest,
      IndexName:                 "targetId-timestamp-index",
      KeyConditionExpression:    "targetId = :t",
      ExpressionAttributeValues: { ":t": targetId },
      ScanIndexForward:          false,
    }));
    return res.json(result.Items);
  }

  const result = await ddb.send(new ScanCommand({ TableName: TABLES.pentest }));
  res.json(result.Items);
}));

// GET /api/pentests/:id — all test results for a given jobId
app.get("/api/pentests/:id", wrap(async (req, res) => {
  const result = await ddb.send(new QueryCommand({
    TableName:                 TABLES.pentest,
    KeyConditionExpression:    "jobId = :j",
    ExpressionAttributeValues: { ":j": req.params.id },
  }));
  if (!result.Items?.length) return res.status(404).json({ error: "Job not found" });
  res.json({ jobId: req.params.id, tests: result.Items });
}));

// POST /api/pentests/scan — trigger a manual pentest scan via SQS
app.post("/api/pentests/scan", wrap(async (req, res) => {
  const { targetUrl, tests } = req.body;
  if (!targetUrl) return res.status(400).json({ error: "targetUrl is required" });
  if (!SQS_QUEUE_URL) return res.status(503).json({ error: "SQS not configured" });

  const jobId = `scan_${randomUUID().slice(0, 8)}`;
  const message = {
    scanId:    jobId,
    targetUrl,
    tests:     tests ?? [],
    createdAt: new Date().toISOString(),
    trigger:   "manual",
  };

  await sqs.send(new SendMessageCommand({
    QueueUrl:    SQS_QUEUE_URL,
    MessageBody: JSON.stringify(message),
  }));

  res.status(202).json({ jobId, status: "queued" });
}));

// GET /api/pentests/:id/report — fetch full JSON report from S3
app.get("/api/pentests/:id/report", wrap(async (req, res) => {
  if (!S3_BUCKET) return res.status(503).json({ error: "S3 not configured" });

  // Get any test result for this jobId to find the reportUrl
  const dbResult = await ddb.send(new QueryCommand({
    TableName:                 TABLES.pentest,
    KeyConditionExpression:    "jobId = :j",
    ExpressionAttributeValues: { ":j": req.params.id },
    Limit: 1,
  }));

  if (!dbResult.Items?.length) return res.status(404).json({ error: "Job not found" });

  const reportUrl = dbResult.Items[0].reportUrl;
  if (!reportUrl) return res.status(404).json({ error: "No report available" });

  // reportUrl format: s3://bucket/pentest/scanId/timestamp.json
  const key = reportUrl.replace(`s3://${S3_BUCKET}/`, "");

  const s3Result = await s3.send(new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key:    key,
  }));

  const body = await s3Result.Body.transformToString();
  res.json(JSON.parse(body));
}));

// ── GitHub Config ─────────────────────────────────────────────────────────────

app.get("/api/webhook-url", (req, res) => {
  res.json({ url: process.env.WEBHOOK_URL ?? "https://<api-gateway-id>.execute-api.us-west-2.amazonaws.com/webhook" });
});

app.get("/api/repos", wrap(async (req, res) => {
  const result = await ddb.send(new ScanCommand({ TableName: TABLES.repos }));
  res.json(result.Items);
}));

app.post("/api/repos", wrap(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  // Use if_not_exists for connected/events so we don't overwrite values
  // the SAST Lambda may have already set from a GitHub ping event.
  const result = await ddb.send(new UpdateCommand({
    TableName: TABLES.repos,
    Key:       { repoId: name },
    UpdateExpression:
      "SET connected = if_not_exists(connected, :f), " +
      "events    = if_not_exists(events, :e), " +
      "addedAt   = if_not_exists(addedAt, :t)",
    ExpressionAttributeValues: {
      ":f": false,
      ":e": [],
      ":t": new Date().toISOString(),
    },
    ReturnValues: "ALL_NEW",
  }));

  res.status(201).json(result.Attributes);
}));

// ── Schedules ─────────────────────────────────────────────────────────────────

app.get("/api/schedules", wrap(async (req, res) => {
  const result = await ddb.send(new ScanCommand({ TableName: TABLES.schedules }));
  res.json(result.Items);
}));

// POST /api/schedules — create schedule + EventBridge rule targeting SQS
app.post("/api/schedules", wrap(async (req, res) => {
  const { targetUrl, cronExpression, tests } = req.body;
  if (!targetUrl || !cronExpression) {
    return res.status(400).json({ error: "targetUrl and cronExpression are required" });
  }
  if (!SQS_QUEUE_URL || !SQS_QUEUE_ARN) {
    return res.status(503).json({ error: "SQS not configured" });
  }

  const scheduleId      = randomUUID();
  const eventBridgeRule = `pentest-schedule-${scheduleId}`;

  const item = {
    scheduleId,
    targetUrl,
    cronExpression,
    tests:           tests ?? ["auth","sqli","nosqli","rate-limit","headers","data-exposure"],
    eventBridgeRule,
    createdAt:       new Date().toISOString(),
    status:          "ACTIVE",
  };

  // Save to DynamoDB
  await ddb.send(new PutCommand({ TableName: TABLES.schedules, Item: item }));

  // Create EventBridge rule
  await eb.send(new PutRuleCommand({
    Name:               eventBridgeRule,
    ScheduleExpression: cronExpression,
    State:              "ENABLED",
    Description:        `Pentest schedule for ${targetUrl}`,
  }));

  // Add SQS as target
  await eb.send(new PutTargetsCommand({
    Rule: eventBridgeRule,
    Targets: [{
      Id:    "sqs-target",
      Arn:   SQS_QUEUE_ARN,
      Input: JSON.stringify({
        scanId:    `scan_sched_${scheduleId.slice(0, 8)}`,
        targetUrl: item.targetUrl,
        tests:     item.tests,
        createdAt: new Date().toISOString(),
        trigger:   "scheduled",
      }),
    }],
  }));

  res.status(201).json(item);
}));

// DELETE /api/schedules/:id — remove schedule + EventBridge rule
app.delete("/api/schedules/:id", wrap(async (req, res) => {
  const existing = await ddb.send(new GetCommand({
    TableName: TABLES.schedules,
    Key: { scheduleId: req.params.id },
  }));
  if (!existing.Item) return res.status(404).json({ error: "Schedule not found" });

  const ruleName = existing.Item.eventBridgeRule;
  try {
    await eb.send(new RemoveTargetsCommand({ Rule: ruleName, Ids: ["sqs-target"] }));
    await eb.send(new DeleteRuleCommand({ Name: ruleName }));
  } catch (err) {
    console.error(`Failed to delete EventBridge rule ${ruleName}:`, err.message);
  }

  await ddb.send(new DeleteCommand({
    TableName: TABLES.schedules,
    Key: { scheduleId: req.params.id },
  }));

  res.json({ deleted: req.params.id });
}));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SecMon API running on http://localhost:${PORT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Tables:`, TABLES);
});
