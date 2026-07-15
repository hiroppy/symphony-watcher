import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFileDefault = promisify(execFileCallback);
const GH_PR_FIELDS = "url,number,state,isDraft,reviewDecision,headRefName";

export async function findPullRequest(event, options = {}) {
  if (!event.workspacePath) return null;
  if (String(event.state).toLowerCase() === "todo") return null;

  const execFile = options.execFile ?? execFileDefault;

  try {
    const { stdout } = await execFile("gh", ["pr", "view", "--json", GH_PR_FIELDS], {
      cwd: event.workspacePath,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(stdout);

    if (!parsed.url) return null;
    if (!matchesIssueIdentifier(parsed.headRefName, event.issueIdentifier)) return null;

    return {
      url: parsed.url,
      number: parsed.number ?? null,
      state: parsed.state ?? null,
      isDraft: parsed.isDraft ?? null,
      reviewDecision: parsed.reviewDecision ?? null,
      headRefName: parsed.headRefName ?? null,
    };
  } catch {
    return null;
  }
}

function matchesIssueIdentifier(headRefName, issueIdentifier) {
  if (!headRefName || !issueIdentifier) return false;

  const normalizedHead = normalizeForMatch(headRefName);
  const normalizedIssue = normalizeForMatch(issueIdentifier);

  return normalizedHead.includes(normalizedIssue);
}

function normalizeForMatch(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}
