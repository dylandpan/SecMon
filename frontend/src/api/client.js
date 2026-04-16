// frontend/src/api/client.js
// All API calls go through here — one place to change the base URL.
//
// Usage in any page:
//   import { getScanList, getScanById } from "../api/client";
//   const scans = await getScanList();

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  return res.json();
}

// ── SAST ──────────────────────────────────────────────────────────────────────
// GET /api/scans         → list of all scans (summary)
// GET /api/scans/:id     → full vulnerability breakdown + S3 report URL
export const getScanList  = ()   => apiFetch("/api/scans");
export const getScanById  = (id) => apiFetch(`/api/scans/${id}`);

// ── PenTest ───────────────────────────────────────────────────────────────────
// GET  /api/pentests           → list all pen test results
// GET  /api/pentests/:id       → all test results for a jobId
// POST /api/pentests/scan      → trigger a manual scan via SQS
// GET  /api/pentests/:id/report → full S3 report
export const getPentestList   = ()   => apiFetch("/api/pentests");
export const getPentestById   = (id) => apiFetch(`/api/pentests/${id}`);
export const triggerPentest   = (targetUrl, tests) => apiFetch("/api/pentests/scan", {
  method: "POST",
  body: JSON.stringify({ targetUrl, tests }),
});
export const getPentestReport = (id) => apiFetch(`/api/pentests/${id}/report`);

// ── Schedules ────────────────────────────────────────────────────────────────
// GET    /api/schedules        → list all schedules
// POST   /api/schedules        → create a new schedule + EventBridge rule
// DELETE /api/schedules/:id    → remove schedule + EventBridge rule
export const getSchedules     = ()  => apiFetch("/api/schedules");
export const createSchedule   = (targetUrl, cronExpression, tests) => apiFetch("/api/schedules", {
  method: "POST",
  body: JSON.stringify({ targetUrl, cronExpression, tests }),
});
export const deleteSchedule   = (id) => apiFetch(`/api/schedules/${id}`, { method: "DELETE" });

// ── GitHub Config ─────────────────────────────────────────────────────────────
// GET  /api/repos        → list of connected repos
// POST /api/repos        → register a new repo
// GET  /api/webhook-url  → the API Gateway URL to paste into GitHub
export const getRepos      = ()     => apiFetch("/api/repos");
export const getWebhookUrl = ()     => apiFetch("/api/webhook-url");
export const addRepo       = (name) => apiFetch("/api/repos", {
  method: "POST",
  body: JSON.stringify({ name }),
});
