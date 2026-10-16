import { createSign } from 'node:crypto';

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

export function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

// Signs a short-lived JWT that identifies the GitHub App itself.
export function createAppJwt({ appId, privateKeyPem, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: String(appId) }));
  const data = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(data).sign(privateKeyPem, 'base64url');
  return `${data}.${signature}`;
}

// Extracts the URL of the next page from a Link header, or null.
export function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.split(',').map((part) => part.trim()).find((part) => part.endsWith('rel="next"'));
  return match ? match.slice(match.indexOf('<') + 1, match.indexOf('>')) : null;
}

export function createGitHubClient(token, { fetchImpl = fetch } = {}) {
  async function send(method, pathOrUrl, body) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;
    const res = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new GitHubError(res.status, `${method} ${pathOrUrl} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return res;
  }

  return {
    async rest(method, path, body) {
      const res = await send(method, path, body);
      return res.status === 204 ? null : res.json();
    },

    // Follows Link headers. `pick` extracts the array from each page, for endpoints that wrap it.
    async paginate(path, pick = (page) => page) {
      const items = [];
      let next = path;
      while (next) {
        const res = await send('GET', next);
        items.push(...pick(await res.json()));
        next = nextPageUrl(res.headers.get('link'));
      }
      return items;
    },

    // Returns { data, errors } and leaves the decision to the caller, because
    // GraphQL reports partial failures alongside data.
    async graphql(query, variables = {}) {
      const res = await send('POST', '/graphql', { query, variables });
      return res.json();
    },
  };
}

export async function createInstallationToken(appJwt, installationId, { fetchImpl } = {}) {
  const client = createGitHubClient(appJwt, { fetchImpl });
  const result = await client.rest('POST', `/app/installations/${installationId}/access_tokens`, {});
  return result.token;
}
