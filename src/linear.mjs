const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

const ISSUE_STATE_QUERY = `
  query OrchestratorWatcherIssueState($id: String!) {
    issue(id: $id) {
      identifier
      title
      state {
        name
        type
      }
      url
    }
  }
`;

export async function fetchLinearIssueState(issueIdentifier, options = {}) {
  const apiKey = Object.hasOwn(options, "apiKey") ? options.apiKey : process.env.LINEAR_API_KEY;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  if (!apiKey || !issueIdentifier) return null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(LINEAR_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: ISSUE_STATE_QUERY,
          variables: { id: issueIdentifier },
        }),
      });

      if (!response.ok) {
        if (shouldRetryResponse(response.status) && attempt < maxAttempts) {
          await sleep(retryDelayMs);
          continue;
        }

        return null;
      }

      const body = await response.json();
      const issue = body?.data?.issue;

      if (!issue) return null;

      return {
        identifier: issue.identifier,
        title: issue.title ?? null,
        state: issue.state?.name ?? null,
        stateType: issue.state?.type ?? null,
        url: issue.url ?? null,
      };
    } catch {
      if (attempt >= maxAttempts) return null;
      await sleep(retryDelayMs);
    }
  }

  return null;
}

function shouldRetryResponse(status) {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
