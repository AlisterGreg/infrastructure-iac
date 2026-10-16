// API Gateway entry point: POST /runs. Lists every repository the GitHub App can see and
// starts one project manager Lambda per repository.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { loadConfig, requireSettings } from './lib/config.mjs';
import { createAppJwt, createGitHubClient, createInstallationToken } from './lib/github.mjs';
import { getPrivateKey } from './lib/secrets.mjs';

const lambda = new LambdaClient({});

export function isAuthorised(headers = {}, expectedKey) {
  const provided = headers['x-factory-key'] ?? '';
  if (!expectedKey || provided.length !== expectedKey.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expectedKey));
}

function reply(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
}

export async function handler(event) {
  const config = loadConfig();
  if (!isAuthorised(event.headers, config.factoryKey)) return reply(401, { error: 'unauthorised' });

  requireSettings(config, ['appId', 'privateKeySecretId', 'projectManagerFunction']);
  const body = parseBody(event);
  // Optional filter, for example { "repos": ["AlisterGreg/sandbox"] }, to limit a run to some repositories.
  const wanted = Array.isArray(body.repos) ? new Set(body.repos) : null;

  const runId = randomUUID();
  const jwt = createAppJwt({ appId: config.appId, privateKeyPem: await getPrivateKey(config.privateKeySecretId) });
  const installations = await createGitHubClient(jwt).paginate('/app/installations');

  const queued = [];
  const skipped = [];
  const seen = new Set();
  for (const installation of installations) {
    const token = await createInstallationToken(jwt, installation.id);
    const repos = await createGitHubClient(token).paginate('/installation/repositories', (page) => page.repositories);
    for (const repo of repos) {
      if (wanted && !wanted.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      if (repo.archived) {
        skipped.push({ repo: repo.full_name, reason: 'archived' });
        continue;
      }
      await lambda.send(
        new InvokeCommand({
          FunctionName: config.projectManagerFunction,
          InvocationType: 'Event', // asynchronous, so each repository gets its own 15-minute budget
          Payload: Buffer.from(
            JSON.stringify({ owner: repo.owner.login, repo: repo.name, installation_id: installation.id, run_id: runId }),
          ),
        }),
      );
      queued.push(repo.full_name);
    }
  }

  const notFound = wanted ? [...wanted].filter((name) => !seen.has(name)) : [];
  return reply(202, { run_id: runId, queued, skipped, not_accessible: notFound });
}
