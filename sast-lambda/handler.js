// handler.js — SAST Lambda
// Triggered by API Gateway when GitHub sends a push webhook.
// Flow: verify signature → fetch repo tree → scan JS/TS files → POST to backend.

import { createHmac } from 'crypto';
import { scanCode } from './scanner.js';

const BACKEND_URL    = process.env.BACKEND_URL;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;

export const handler = async (event) => {
  try {
    const body      = event.body ?? '{}';
    const signature = event.headers?.['x-hub-signature-256'] ?? '';
    const eventType = event.headers?.['x-github-event'] ?? '';

    // Verify GitHub webhook HMAC signature
    if (WEBHOOK_SECRET) {
      const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
      if (signature !== expected) {
        console.warn('Webhook signature mismatch');
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
      }
    }

    // Only handle push events
    if (eventType !== 'push') {
      return { statusCode: 200, body: JSON.stringify({ message: `Event '${eventType}' ignored` }) };
    }

    const payload = JSON.parse(body);
    const { repository, ref, commits } = payload;

    if (!repository || !commits?.length) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No commits to scan' }) };
    }

    const repoFullName = repository.full_name;
    const branch       = (ref ?? 'refs/heads/main').replace('refs/heads/', '');

    console.log(`Scanning ${repoFullName}@${branch}`);

    // Fetch list of JS/TS files from repo tree
    const files = await fetchRepoFiles(repoFullName, branch);
    console.log(`Found ${files.length} JS/TS file(s) to scan`);

    // Scan each file
    const allFindings = [];
    for (const file of files) {
      const content = await fetchFileContent(file.blobUrl);
      if (content) {
        const findings = scanCode(content, file.path);
        allFindings.push(...findings);
      }
    }

    // Summarise by severity
    const high   = allFindings.filter(v => v.severity === 'high').length;
    const medium = allFindings.filter(v => v.severity === 'medium').length;
    const low    = allFindings.filter(v => v.severity === 'low').length;
    const status = high > 0 ? 'FAIL' : medium > 0 ? 'WARN' : 'PASS';

    // POST results to backend
    await postScanResult({ repoId: repoFullName, branch, status, high, medium, low, vulnerabilities: allFindings });

    console.log(`Scan complete: ${high}H ${medium}M ${low}L → ${status}`);
    return { statusCode: 200, body: JSON.stringify({ repoId: repoFullName, status, high, medium, low }) };

  } catch (err) {
    console.error('SAST scan error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// ── GitHub API helpers ────────────────────────────────────────────────────────

async function githubFetch(url) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept':        'application/vnd.github.v3+json',
      'User-Agent':    'SecMon-SAST-Scanner/1.0',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}

async function fetchRepoFiles(repoFullName, branch) {
  const tree = await githubFetch(
    `https://api.github.com/repos/${repoFullName}/git/trees/${branch}?recursive=1`
  );
  return (tree.tree ?? [])
    .filter(f => f.type === 'blob' && /\.(js|ts|jsx|tsx)$/.test(f.path))
    .map(f => ({ path: f.path, blobUrl: f.url }));
}

async function fetchFileContent(blobUrl) {
  try {
    const blob = await githubFetch(blobUrl);
    if (blob.encoding === 'base64') {
      return Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf-8');
    }
    return blob.content ?? null;
  } catch {
    return null;
  }
}

// ── Backend API helper ────────────────────────────────────────────────────────

async function postScanResult(result) {
  const res = await fetch(`${BACKEND_URL}/api/scans`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(result),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend POST /api/scans failed: ${res.status} — ${text}`);
  }
}
