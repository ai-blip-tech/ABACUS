const PLACEHOLDER_SECRETS = new Set(["replace-me", "changeme", "your-key-here", "your-openai-api-key", "your-roboflow-api-key", ""]);

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

export function googleOAuthConfig() {
  const clientId = configuredSecret(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = configuredSecret(process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || "";
  return { clientId, clientSecret, redirectUri, enabled: Boolean(clientId && clientSecret) };
}
