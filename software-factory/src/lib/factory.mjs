// Pure logic for the project manager: dedupe keys, reconciliation and tool input checks.

export const BASE_LABEL = 'security-planner';
export const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
export const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
export const TYPE_LABELS = ['dep-upgrade', 'waiting', 'dependency-removal'];
export const EXTRA_LABELS = [
  'waiting-artifactory',
  'waiting-upstream',
  'waiting-internal',
  'abandoned',
  'no-fix-available',
  'licence-change',
];
const KEY_PATTERN = /<!-- security-planner-key: (.+?) -->/;

export function alertKey(repoFullName, alertNumber) {
  return `dependabot-alert:${repoFullName}#${alertNumber}`;
}

export function keyComment(key) {
  return `<!-- security-planner-key: ${key} -->`;
}

export function keyFromBody(body) {
  return body?.match(KEY_PATTERN)?.[1] ?? null;
}

// Pulls the alert number out of a dependabot-alert key, or null for other keys.
export function alertNumberFromKey(key) {
  const match = /^dependabot-alert:.+#(\d+)$/.exec(key ?? '');
  return match ? Number(match[1]) : null;
}

// Decides what one run does for one repository.
//   alerts: open Dependabot alerts now (each has .number)
//   issues: every security-planner issue, open or closed (each has .state, .body, .number)
export function planRun({ repoFullName, alerts, issues, maxNewIssues }) {
  const openNumbers = new Set(alerts.map((alert) => alert.number));
  const issueByKey = new Map();
  for (const issue of issues) {
    const key = keyFromBody(issue.body);
    if (key) issueByKey.set(key, issue);
  }

  const toClose = issues.filter((issue) => {
    if (issue.state !== 'open') return false;
    const number = alertNumberFromKey(keyFromBody(issue.body));
    return number !== null && !openNumbers.has(number);
  });

  // An alert with any existing issue (open, or closed as completed or not planned) is never raised again here.
  const tracked = [];
  const toCreate = [];
  for (const alert of alerts) {
    const key = alertKey(repoFullName, alert.number);
    if (issueByKey.has(key)) tracked.push(alert);
    else toCreate.push(alert);
  }

  return {
    toClose,
    tracked,
    toCreate: toCreate.slice(0, maxNewIssues),
    deferred: toCreate.slice(maxNewIssues),
  };
}

// Checks the agent's create_issue input. Throws with a message the agent can act on.
export function validateIssueInput(input) {
  const fail = (message) => {
    throw new Error(`create_issue: ${message}`);
  };
  if (!Number.isInteger(input?.alert_number)) fail('alert_number must be an integer');
  if (typeof input.title !== 'string' || input.title.trim() === '' || input.title.length > 200) {
    fail('title must be 1-200 characters');
  }
  if (typeof input.body !== 'string' || input.body.trim() === '') fail('body is required');
  if (!PRIORITIES.includes(input.priority)) fail(`priority must be one of ${PRIORITIES.join(', ')}`);
  if (!SIZES.includes(input.size)) fail(`size must be one of ${SIZES.join(', ')}`);
  if (!TYPE_LABELS.includes(input.type_label)) fail(`type_label must be one of ${TYPE_LABELS.join(', ')}`);
  const extra = input.extra_labels ?? [];
  if (!Array.isArray(extra) || extra.length > 3 || extra.some((label) => !EXTRA_LABELS.includes(label))) {
    fail(`extra_labels must be up to 3 of ${EXTRA_LABELS.join(', ')}`);
  }
  return {
    alertNumber: input.alert_number,
    title: input.title.trim(),
    body: input.body.trim(),
    priority: input.priority,
    size: input.size,
    labels: [BASE_LABEL, input.type_label, ...extra],
  };
}

// Reduces an alert to the fields the agent needs. Alert text is untrusted data, so it is cut to a sane length.
export function summariseAlert(alert) {
  const advisory = alert.security_advisory ?? {};
  const vulnerability = alert.security_vulnerability ?? {};
  return {
    number: alert.number,
    ecosystem: alert.dependency?.package?.ecosystem,
    package: alert.dependency?.package?.name,
    manifest_path: alert.dependency?.manifest_path,
    scope: alert.dependency?.scope,
    severity: advisory.severity ?? vulnerability.severity,
    cvss: advisory.cvss?.score ?? null,
    ghsa_id: advisory.ghsa_id,
    cve_id: advisory.cve_id,
    summary: String(advisory.summary ?? '').slice(0, 500),
    vulnerable_version_range: vulnerability.vulnerable_version_range,
    first_patched_version: vulnerability.first_patched_version?.identifier ?? null,
    html_url: alert.html_url,
  };
}
