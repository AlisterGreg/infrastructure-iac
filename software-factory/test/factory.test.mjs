import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertKey, keyComment, planRun, validateIssueInput } from '../src/lib/factory.mjs';
import { nextPageUrl, createAppJwt } from '../src/lib/github.mjs';
import { generateKeyPairSync, createVerify } from 'node:crypto';

const REPO = 'AlisterGreg/sandbox';

function issue(number, state, alertNumber) {
  return { number, state, body: `${keyComment(alertKey(REPO, alertNumber))}\n\ntext` };
}

test('planRun closes issues whose alert is no longer open', () => {
  const plan = planRun({
    repoFullName: REPO,
    alerts: [{ number: 2 }],
    issues: [issue(10, 'open', 1), issue(11, 'open', 2)],
    maxNewIssues: 25,
  });
  assert.deepEqual(plan.toClose.map((i) => i.number), [10]);
});

test('planRun never re-raises an alert that already has an issue, open or closed', () => {
  const plan = planRun({
    repoFullName: REPO,
    alerts: [{ number: 1 }, { number: 2 }],
    issues: [issue(10, 'closed', 1)],
    maxNewIssues: 25,
  });
  assert.deepEqual(plan.toCreate.map((a) => a.number), [2]);
  assert.deepEqual(plan.tracked.map((a) => a.number), [1]);
});

test('planRun caps new issues and reports the rest as deferred', () => {
  const alerts = [{ number: 1 }, { number: 2 }, { number: 3 }];
  const plan = planRun({ repoFullName: REPO, alerts, issues: [], maxNewIssues: 2 });
  assert.equal(plan.toCreate.length, 2);
  assert.equal(plan.deferred.length, 1);
});

test('validateIssueInput rejects a priority outside the board options', () => {
  assert.throws(
    () => validateIssueInput({ alert_number: 1, title: 't', body: 'b', priority: 'Critical', size: 'M', type_label: 'dep-upgrade' }),
    /priority must be one of/,
  );
});

test('validateIssueInput builds the label set with the base label first', () => {
  const input = validateIssueInput({
    alert_number: 7,
    title: 'Upgrade lodash',
    body: 'body',
    priority: 'High',
    size: 'S',
    type_label: 'waiting',
    extra_labels: ['waiting-upstream'],
  });
  assert.deepEqual(input.labels, ['security-planner', 'waiting', 'waiting-upstream']);
  assert.equal(input.alertNumber, 7);
});

test('validateIssueInput rejects an unknown extra label', () => {
  assert.throws(
    () => validateIssueInput({ alert_number: 1, title: 't', body: 'b', priority: 'Low', size: 'XS', type_label: 'dep-upgrade', extra_labels: ['made-up'] }),
    /extra_labels must be/,
  );
});

test('nextPageUrl reads the next link and ignores the others', () => {
  const link = '<https://api.github.com/x?page=1>; rel="prev", <https://api.github.com/x?page=3>; rel="next"';
  assert.equal(nextPageUrl(link), 'https://api.github.com/x?page=3');
  assert.equal(nextPageUrl('<https://api.github.com/x?page=1>; rel="last"'), null);
  assert.equal(nextPageUrl(null), null);
});

test('createAppJwt signs a verifiable RS256 token with the app id as issuer', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const token = createAppJwt({ appId: '12345', privateKeyPem: pem, nowSeconds: 1000 });
  const [header, payload, signature] = token.split('.');
  const valid = createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, signature, 'base64url');
  assert.equal(valid, true);
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.iss, '12345');
  assert.ok(claims.exp - claims.iat <= 600);
});
