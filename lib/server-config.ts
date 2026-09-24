const PLACEHOLDER_SECRETS = new Set(["replace-me", "changeme", "your-key-here", ""]);

function configuredSecret(value: string | undefined) {
  const secret = value?.trim() || "";
  return PLACEHOLDER_SECRETS.has(secret.toLowerCase()) ? "" : secret;
}

export function openAIKey() {
  return configuredSecret(process.env.OPENAI_API_KEY);
}

export function roboflowKey() {
  return configuredSecret(process.env.ROBOFLOW_API_KEY);
}
