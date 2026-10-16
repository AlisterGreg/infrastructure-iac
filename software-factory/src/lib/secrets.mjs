import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// The AWS SDK is part of the Node.js Lambda runtime, so no packages are bundled.
const client = new SecretsManagerClient({});
let cachedPrivateKey = null;

// The GitHub App private key is read once per Lambda container.
export async function getPrivateKey(secretId) {
  if (!cachedPrivateKey) {
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (!result.SecretString) throw new Error(`secret ${secretId} has no value; set it with put-secret-value`);
    cachedPrivateKey = result.SecretString;
  }
  return cachedPrivateKey;
}
