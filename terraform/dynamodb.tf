# dynamodb.tf
# 4 tables — all use the secmon- prefix.
# Writers: SAST Lambda, PenTest Lambda, EC2 Backend
# Reader:  EC2 Backend (serves frontend dashboard)

# ── Table 1: scans ───────────────────────────────────────────────────────────
# Writer: SAST Lambda (after scanning a repo)
# Reader: EC2 Backend -> GET /api/scans
resource "aws_dynamodb_table" "scans" {
  name         = "${var.project_name}-scans"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scanId"

  attribute {
    name = "scanId"
    type = "S"
  }

  attribute {
    name = "repoId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "repoId-timestamp-index"
    hash_key        = "repoId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  tags = { Name = "${var.project_name}-scans" }
}

# ── Table 2: pentest-results ─────────────────────────────────────────────────
# Writer: PenTest Lambda (one item per test per scan)
# Reader: EC2 Backend -> GET /api/pentests
resource "aws_dynamodb_table" "pentest_results" {
  name         = "${var.project_name}-pentest-results"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"
  range_key    = "testName"

  attribute {
    name = "jobId"
    type = "S"
  }

  attribute {
    name = "testName"
    type = "S"
  }

  attribute {
    name = "targetId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "targetId-timestamp-index"
    hash_key        = "targetId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  tags = { Name = "${var.project_name}-pentest-results" }
}

# ── Table 3: repos ───────────────────────────────────────────────────────────
# Writer: EC2 Backend (user registers a repo via GitHub Config page)
# Reader: EC2 Backend -> GET /api/repos
resource "aws_dynamodb_table" "repos" {
  name         = "${var.project_name}-repos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "repoId"

  attribute {
    name = "repoId"
    type = "S"
  }

  tags = { Name = "${var.project_name}-repos" }
}

# ── Table 4: schedules ──────────────────────────────────────────────────────
# Writer: EC2 Backend (user creates pen test schedule)
# Reader: EC2 Backend -> GET /api/schedules
resource "aws_dynamodb_table" "schedules" {
  name         = "${var.project_name}-schedules"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scheduleId"

  attribute {
    name = "scheduleId"
    type = "S"
  }

  tags = { Name = "${var.project_name}-schedules" }
}
