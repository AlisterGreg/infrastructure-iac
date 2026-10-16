import { addIssueToBoard } from './board.mjs';
import { alertKey, keyComment, validateIssueInput } from './factory.mjs';

const MAX_FILE_CHARS = 20000;

export const TOOL_SPECS = [
  {
    toolSpec: {
      name: 'read_repo_file',
      description:
        'Read a file from the default branch of the repository, such as a package manifest or lockfile. Returns the text (truncated if long), or the names of entries when the path is a directory.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Path from the repository root, e.g. "package.json"' } },
          required: ['path'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'create_issue',
      description:
        'Create one issue for one Dependabot alert in the input, add it to the project board, and set its Priority and Size. Call once per alert.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            alert_number: { type: 'integer', description: 'The number of the alert this issue is for' },
            title: { type: 'string' },
            body: { type: 'string', description: 'Markdown body, following the template in the system prompt' },
            priority: { type: 'string', enum: ['Urgent', 'High', 'Medium', 'Low'] },
            size: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
            type_label: { type: 'string', enum: ['dep-upgrade', 'waiting', 'dependency-removal'] },
            extra_labels: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'waiting-artifactory',
                  'waiting-upstream',
                  'waiting-internal',
                  'abandoned',
                  'no-fix-available',
                  'licence-change',
                ],
              },
            },
          },
          required: ['alert_number', 'title', 'body', 'priority', 'size', 'type_label'],
        },
      },
    },
  },
];

// Builds the tools the agent can call for one repository.
//   gh: GitHub client bound to an installation token
//   newAlerts: Map of alert number -> alert, the only alerts this run may raise issues for
export function createToolbox({ gh, owner, repo, newAlerts, board }) {
  const repoFullName = `${owner}/${repo}`;
  const raised = new Set();
  let existingLabels = null;

  async function ensureLabels(labels) {
    if (!existingLabels) {
      const list = await gh.paginate(`/repos/${owner}/${repo}/labels?per_page=100`);
      existingLabels = new Set(list.map((label) => label.name));
    }
    for (const label of labels) {
      if (existingLabels.has(label)) continue;
      await gh.rest('POST', `/repos/${owner}/${repo}/labels`, { name: label, color: 'ededed' });
      existingLabels.add(label);
    }
  }

  async function readRepoFile({ path }) {
    if (typeof path !== 'string' || path.includes('..') || path.startsWith('/')) {
      throw new Error('read_repo_file: path must be relative and must not contain ".."');
    }
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const item = await gh.rest('GET', `/repos/${owner}/${repo}/contents/${encoded}`);
    if (Array.isArray(item)) return { type: 'directory', entries: item.map((entry) => entry.name) };
    if (item.encoding !== 'base64') throw new Error('read_repo_file: unexpected encoding');
    const text = Buffer.from(item.content, 'base64').toString('utf8');
    return text.length > MAX_FILE_CHARS
      ? { type: 'file', truncated: true, content: text.slice(0, MAX_FILE_CHARS) }
      : { type: 'file', truncated: false, content: text };
  }

  async function createIssue(raw) {
    const input = validateIssueInput(raw);
    const alert = newAlerts.get(input.alertNumber);
    if (!alert) throw new Error(`create_issue: alert ${input.alertNumber} is not one of this run's new alerts`);
    if (raised.has(input.alertNumber)) throw new Error(`create_issue: alert ${input.alertNumber} already has an issue`);

    const key = alertKey(repoFullName, input.alertNumber);
    await ensureLabels(input.labels);
    const issue = await gh.rest('POST', `/repos/${owner}/${repo}/issues`, {
      title: input.title,
      body: `${keyComment(key)}\n\n${input.body}`,
      labels: input.labels,
    });
    raised.add(input.alertNumber);

    const boardResult = board
      ? await addIssueToBoard(gh, board, issue.node_id, { Priority: input.priority, Size: input.size })
      : { errors: ['no project board configured'] };

    return {
      number: issue.number,
      url: issue.html_url,
      priority: input.priority,
      size: input.size,
      board_errors: boardResult.errors,
    };
  }

  const handlers = { read_repo_file: readRepoFile, create_issue: createIssue };

  return {
    specs: TOOL_SPECS,
    async run(name, input) {
      const handler = handlers[name];
      if (!handler) throw new Error(`unknown tool ${name}`);
      return handler(input ?? {});
    },
    raised,
  };
}
