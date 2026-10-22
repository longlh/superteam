export function createGoogleChat({
  webhookUrl,
  fetch = globalThis.fetch,
  timeoutMs = 10000,
}) {
  return {
    async post(message) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: message,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        return response.ok === true;
      } catch {
        return false;
      }
    },
  };
}

export function fromEnv(config, env, fetch) {
  const webhookUrl = env[config.webhook];
  if (!webhookUrl) {
    throw new Error(
      `The environment variable ${config.webhook} is missing: it holds the Google Chat webhook`,
    );
  }
  return createGoogleChat({
    webhookUrl,
    fetch,
  });
}
