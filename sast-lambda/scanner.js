// scanner.js — regex-based SAST rules
// Detects vulnerability patterns in JavaScript/TypeScript source code.
// Categories mirror the vulnerability types in sast-targets/vulnerable-app.js.

const RULES = [
  // ── HIGH ────────────────────────────────────────────────────────────────────
  {
    id: 'HARDCODED_SECRET',
    severity: 'high',
    patterns: [
      /(?:api[_-]?key|apikey|secret|password|passwd|token)\s*=\s*['"][^'"]{8,}['"]/gi,
      /AKIA[0-9A-Z]{16}/g,
    ],
    message: 'Hardcoded secret or API key detected',
  },
  {
    id: 'SQL_INJECTION',
    severity: 'high',
    patterns: [
      /["'`]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b.+["'`]\s*\+/gi,
      /\.query\s*\(\s*`[^`]*\$\{/gi,
    ],
    message: 'Potential SQL injection via string concatenation',
  },
  {
    id: 'NOSQL_INJECTION',
    severity: 'high',
    patterns: [
      /\.(find|findOne|update|delete)\s*\(\s*req\.(body|query|params)\s*\)/g,
    ],
    message: 'Potential NoSQL injection via unsanitized request input',
  },
  {
    id: 'XSS',
    severity: 'high',
    patterns: [
      /\.innerHTML\s*=\s*(?!['"`])/g,
      /document\.write\s*\(/g,
    ],
    message: 'Potential XSS via direct DOM manipulation with dynamic content',
  },
  {
    id: 'PATH_TRAVERSAL',
    severity: 'high',
    patterns: [
      /readFile(?:Sync)?\s*\(\s*req\.(body|query|params)/g,
      /path\.join\s*\([^)]*req\.(body|query|params)/g,
    ],
    message: 'Potential path traversal via unsanitized request input',
  },
  {
    id: 'INSECURE_FUNCTION',
    severity: 'high',
    patterns: [
      /\beval\s*\(/g,
      /exec\s*\([^)]*(?:\+|`[^`]*\$\{)/g,
      /new\s+Function\s*\(/g,
    ],
    message: 'Dangerous function: eval / exec / Function constructor',
  },

  // ── MEDIUM ──────────────────────────────────────────────────────────────────
  {
    id: 'HARDCODED_IP',
    severity: 'medium',
    patterns: [
      /['"`]\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?['"`]/g,
    ],
    message: 'Hardcoded IP address',
  },
  {
    id: 'WEAK_CRYPTO',
    severity: 'medium',
    patterns: [
      /createHash\s*\(\s*['"`](?:md5|sha1)['"`]\s*\)/gi,
    ],
    message: 'Weak cryptographic algorithm (MD5 or SHA1)',
  },
  {
    id: 'INSECURE_RANDOM',
    severity: 'medium',
    patterns: [
      /Math\.random\s*\(\s*\)/g,
    ],
    message: 'Math.random() is not cryptographically secure',
  },
  {
    id: 'SENSITIVE_DATA_LOG',
    severity: 'medium',
    patterns: [
      /console\.log\s*\([^)]*(?:password|passwd|secret|token|api[_-]?key|credit.?card)[^)]*\)/gi,
    ],
    message: 'Potential sensitive data written to logs',
  },

  // ── LOW ─────────────────────────────────────────────────────────────────────
  {
    id: 'SECURITY_TODO',
    severity: 'low',
    patterns: [
      /\/\/\s*(?:TODO|FIXME|HACK)\b.*(?:security|auth|vuln|inject|xss|password|secret)/gi,
    ],
    message: 'Unresolved security-related TODO/FIXME comment',
  },
];

export function scanCode(source, filePath) {
  const lines = source.split('\n');
  const findings = [];

  for (const rule of RULES) {
    const matchedLines = new Set();

    for (const pattern of rule.patterns) {
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          matchedLines.add(i + 1); // 1-indexed line numbers
        }
        pattern.lastIndex = 0; // reset global regex state
      }
    }

    for (const line of matchedLines) {
      findings.push({
        type: rule.id,
        severity: rule.severity,
        message: rule.message,
        file: filePath,
        line,
      });
    }
  }

  return findings;
}
