// Reads runtime settings from the Lambda environment (set in terraform/lambda.tf).
export function loadConfig(env = process.env) {
  return {
    appId: env.GITHUB_APP_ID,
    privateKeySecretId: env.GITHUB_PRIVATE_KEY_SECRET_ID,
    factoryKey: env.FACTORY_KEY,
    projectOwner: env.PROJECT_OWNER,
    projectNumber: Number(env.PROJECT_NUMBER) || null,
    modelId: env.BEDROCK_MODEL_ID,
    projectManagerFunction: env.PROJECT_MANAGER_FUNCTION_NAME,
    maxTurns: Number(env.AGENT_MAX_TURNS ?? 25),
    maxNewIssues: Number(env.MAX_NEW_ISSUES ?? 25),
  };
}

export function requireSettings(config, names) {
  const missing = names.filter((name) => !config[name]);
  if (missing.length > 0) throw new Error(`missing configuration: ${missing.join(', ')}`);
}
