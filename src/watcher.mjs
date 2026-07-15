#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { diffSnapshots } from "./diff.mjs";
import { fetchLinearIssueState } from "./linear.mjs";
import { findPullRequest } from "./pull-request.mjs";
import { buildSlackPayload } from "./slack.mjs";

const currentFile = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(currentFile);
const projectDirectory = dirname(scriptDirectory);
const DEFAULT_CONFIG_PATH = resolve(projectDirectory, "config.json");
const DEFAULT_STATE_PATH = "state.json";
const DEFAULT_INTERVAL_MS = 30_000;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const configPath = resolve(options.config ?? DEFAULT_CONFIG_PATH);
  const config = await readJson(configPath);
  const statePath = resolve(dirname(configPath), config.statePath ?? DEFAULT_STATE_PATH);
  const intervalMs = Number(config.intervalMs ?? DEFAULT_INTERVAL_MS);
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || config.slackWebhookUrl;
  const linearApiKey = process.env.LINEAR_API_KEY || config.linearApiKey;

  validateConfig(config, intervalMs);

  if (!slackWebhookUrl && !options.dryRun) {
    throw new Error("Slack webhook is required. Set SLACK_WEBHOOK_URL or config.slackWebhookUrl.");
  }

  while (true) {
    await runOnce({ config: { ...config, linearApiKey }, statePath, slackWebhookUrl, dryRun: options.dryRun });

    if (options.once) break;
    await sleep(intervalMs);
  }
}

export async function runOnce({ config, statePath, slackWebhookUrl, dryRun = false }) {
  const previous = await readState(statePath);
  const current = await collectSnapshots(config.services);
  const events = diffSnapshots(previous, current, config);

  for (const event of events) {
    const enrichedEvent = await enrichEvent(event, config);
    const slackPayload = buildSlackPayload(enrichedEvent);

    if (dryRun) {
      console.log(JSON.stringify({ event: enrichedEvent, slack: slackPayload }, null, 2));
    } else {
      await postSlack(slackWebhookUrl, slackPayload);
    }
  }

  if (!dryRun) {
    await writeState(statePath, current);
  }

  return { events, current };
}

async function enrichEvent(event, config) {
  const isEnded = event.type === "ended";
  const linearIssue = await fetchLinearIssueState(event.issueIdentifier, {
    apiKey: config.linearApiKey,
    maxAttempts: isEnded ? (config.endedLinearMaxAttempts ?? 2) : 1,
    retryDelayMs: isEnded ? (config.endedLinearRetryDelayMs ?? 5_000) : 0,
  });
  const pullRequest = await findPullRequest(event);
  return compactObject({
    ...event,
    issueTitle: linearIssue?.title,
    issueUrl: linearIssue?.url ?? event.issueUrl,
    resolvedState: linearIssue?.state,
    resolvedStateType: linearIssue?.stateType,
    pullRequest,
  });
}

async function collectSnapshots(services) {
  const entries = await Promise.all(
    services.map(async (service) => {
      try {
        const response = await fetch(service.url, {
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return [service.name, await response.json()];
      } catch (error) {
        return [service.name, serviceUnavailableSnapshot(service, error)];
      }
    }),
  );

  return Object.fromEntries(entries);
}

function serviceUnavailableSnapshot(service, error) {
  const message = error?.message || String(error);
  return {
    running: [],
    retrying: [
      {
        issue_identifier: `watcher:${service.name}`,
        state: "unavailable",
        error: `${service.url} ${message}`,
      },
    ],
    blocked: [],
  };
}

async function postSlack(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook returned HTTP ${response.status}: ${body}`);
  }
}

async function readState(statePath) {
  try {
    return await readJson(statePath);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeState(statePath, state) {
  const tmpPath = `${statePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmpPath, statePath);
}

function parseArgs(args) {
  const options = { once: false, dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--once") {
      options.once = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--config") {
      options.config = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function validateConfig(config, intervalMs) {
  if (!Array.isArray(config.services) || config.services.length === 0) {
    throw new Error("config.services must contain at least one service.");
  }

  for (const service of config.services) {
    if (!service.name || !service.url) {
      throw new Error("Each service must include name and url.");
    }
  }

  if (!Number.isFinite(intervalMs) || intervalMs < 5_000) {
    throw new Error("intervalMs must be at least 5000.");
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));
}

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
